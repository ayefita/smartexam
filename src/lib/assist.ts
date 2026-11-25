import { aiConfigured, askModel } from "./ai";
import { query } from "./db";
import { attemptCount, getExam, getQuestion, gradeEssays, managesOrg, saveQuestion } from "./domain";
import { num, parseJson } from "./format";
import type { Difficulty, User } from "./types";

export type Suggestion = {
  id: string;
  kind: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  status: string;
  source: "model" | "local" | "demo";
  createdAt: string;
};

type RubricLine = { criterion: string; awarded: number; max: number; note: string };

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 || /^\d+(\.\d+)?$/.test(word)),
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function mapSuggestion(row: Record<string, unknown>): Suggestion {
  const source = row.source === "local" || row.source === "demo" ? row.source : "model";
  return {
    id: String(row.id),
    kind: String(row.kind),
    entity: String(row.entity),
    entityId: String(row.entity_id),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    status: String(row.status),
    source,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : "",
  };
}

export async function latestSuggestion(kind: string, entityId: string) {
  const rows = await query(
    `select * from ai_suggestions where kind = $1 and entity_id = $2 order by created_at desc limit 1`,
    [kind, entityId],
  );
  return rows[0] ? mapSuggestion(rows[0]) : null;
}

export async function suggestionsFor(kind: string, entityIds: string[]) {
  if (!entityIds.length) return new Map<string, Suggestion>();
  const rows = await query(
    `select distinct on (entity_id) * from ai_suggestions where kind = $1 and entity_id = any($2::text[]) order by entity_id, created_at desc`,
    [kind, entityIds],
  );
  return new Map(rows.map((row) => [String(row.entity_id), mapSuggestion(row)]));
}

async function storeSuggestion(actor: User, input: { organizationId: string | null; kind: string; entity: string; entityId: string; payload: Record<string, unknown>; source: "model" | "local" }) {
  await query(`delete from ai_suggestions where kind = $1 and entity_id = $2 and status = 'suggested'`, [input.kind, input.entityId]);
  const id = crypto.randomUUID();
  await query(
    `insert into ai_suggestions (id, organization_id, kind, entity, entity_id, payload, status, source, created_by)
     values ($1,$2,$3,$4,$5,$6::jsonb,'suggested',$7,$8)`,
    [id, input.organizationId, input.kind, input.entity, input.entityId, JSON.stringify(input.payload), input.source, actor.id],
  );
  return latestSuggestion(input.kind, input.entityId);
}

export async function setSuggestionStatus(actor: User, id: string, status: "accepted" | "edited" | "dismissed", payload?: Record<string, unknown>) {
  const rows = await query(`select * from ai_suggestions where id = $1`, [id]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const organizationId = rows[0].organization_id ? String(rows[0].organization_id) : "";
  if (organizationId && !managesOrg(actor, organizationId) && actor.role !== "super_admin") return { ok: false as const, error: "forbidden" };
  if (!organizationId && actor.role === "candidate") return { ok: false as const, error: "forbidden" };
  await query(
    `update ai_suggestions set status = $2, reviewed_by = $3, reviewed_at = now(), payload = coalesce($4::jsonb, payload) where id = $1`,
    [id, status, actor.id, payload ? JSON.stringify(payload) : null],
  );
  return { ok: true as const };
}

export function localGrade(input: { answer: string; explanation: string; accepted: string[]; max: number }) {
  const exact = input.accepted.some((item) => item.trim().toLowerCase() === input.answer.trim().toLowerCase());
  if (exact) {
    return {
      points: input.max,
      max: input.max,
      comment: "The answer matches an accepted answer. Confirm it, then save.",
      rubric: [{ criterion: "Matches an accepted answer", awarded: input.max, max: input.max, note: "Exact match with the marking guide." }],
    };
  }
  const answer = tokens(input.answer);
  const guide = tokens([input.explanation, ...input.accepted].join(" "));
  const overlap = exact ? 1 : jaccard(answer, guide);
  const guideMax = Math.max(1, input.max - 1);
  const coverage = clamp(overlap * guideMax, guideMax);
  const lines: RubricLine[] = [
    { criterion: "Addresses the task", awarded: input.answer.trim().length > 20 ? Math.min(1, input.max) : 0, max: Math.min(1, input.max), note: input.answer.trim().length > 20 ? "The answer is long enough to respond." : "The answer is very short." },
    { criterion: "Matches the marking guide", awarded: input.max > 1 ? coverage : overlap >= 0.5 ? 1 : 0, max: input.max > 1 ? guideMax : 1, note: `${Math.round(overlap * 100)}% of the guide words appear in the answer.` },
  ];
  const points = clamp(lines.reduce((sum, line) => sum + line.awarded, 0), input.max);
  return {
    points,
    max: input.max,
    comment: "Draft only. Compare the answer with the marking guide, then accept or change the score.",
    rubric: lines,
  };
}

export async function proposeGrade(actor: User, input: { organizationId: string; attemptId: string; questionId: string; stem: string; answer: string; explanation: string; accepted: string[]; max: number }) {
  const entityId = `${input.attemptId}:${input.questionId}`;
  if (aiConfigured()) {
    const asked = await askModel(
      'You suggest a mark. Reply with JSON only: {"points":0,"comment":"","rubric":[{"criterion":"","awarded":0,"max":1,"note":""}]}. points cannot exceed the maximum. This is a suggestion for a human reviewer.',
      `Maximum points: ${input.max}\nQuestion: ${input.stem}\nMarking guide: ${input.explanation}\nAccepted answers: ${input.accepted.join(" | ") || "(essay)"}\nCandidate answer:\n${input.answer}`,
    );
    if (!asked.ok) return asked;
    const points = clamp(num(asked.data.points), input.max);
    const rubric = Array.isArray(asked.data.rubric) ? asked.data.rubric : [];
    const payload = { points, max: input.max, comment: String(asked.data.comment || "").slice(0, 2000), rubric };
    await storeSuggestion(actor, { organizationId: input.organizationId, kind: "grade", entity: "answer", entityId, payload, source: "model" });
    return { ok: true as const };
  }
  await storeSuggestion(actor, {
    organizationId: input.organizationId,
    kind: "grade",
    entity: "answer",
    entityId,
    payload: localGrade(input),
    source: "local",
  });
  return { ok: true as const };
}

export function localQuality(input: { stem: string; type: string; options: { id: string; text: string }[]; correct: string[]; explanation: string; difficulty: string; calibrated: string; others: { id: string; stem: string }[] }) {
  const stemTokens = tokens(input.stem);
  const notes: string[] = [];
  let ambiguous = input.stem.trim().length < 25;
  if (ambiguous) notes.push("The stem is very short.");
  if (/all of the above|none of the above/i.test(input.stem)) {
    ambiguous = true;
    notes.push("The stem uses an all-or-none phrase. Check that the options make that phrase true.");
  }
  const optionTokens = input.options.map((option) => ({ id: option.id, text: option.text, tokens: tokens(option.text) }));
  for (let i = 0; i < optionTokens.length; i += 1) {
    for (let j = i + 1; j < optionTokens.length; j += 1) {
      if (jaccard(optionTokens[i].tokens, optionTokens[j].tokens) > 0.72) {
        ambiguous = true;
        notes.push(`Options look alike: “${optionTokens[i].text}” and “${optionTokens[j].text}”.`);
      }
    }
  }
  const duplicates = input.others
    .map((other) => ({ ...other, score: jaccard(stemTokens, tokens(other.stem)) }))
    .filter((other) => other.score >= 0.55)
    .slice(0, 3)
    .map((other) => ({ id: other.id, stem: other.stem, why: `${Math.round(other.score * 100)}% of the words overlap.` }));
  let wrongKey = "";
  if ((input.type === "single" || input.type === "true_false") && input.correct.length !== 1) wrongKey = "This question should have exactly one keyed answer.";
  if (input.type === "multiple" && input.correct.length < 1) wrongKey = "No correct option is keyed.";
  const explanation = input.explanation.toLowerCase();
  const keyed = input.options.filter((option) => input.correct.includes(option.id));
  const others = input.options.filter((option) => !input.correct.includes(option.id));
  const keyedMentioned = keyed.some((option) => option.text.length > 3 && explanation.includes(option.text.toLowerCase()));
  const otherMentioned = others.find((option) => option.text.length > 8 && explanation.includes(option.text.toLowerCase()));
  if (!wrongKey && otherMentioned && !keyedMentioned) wrongKey = `The explanation quotes “${otherMentioned.text}”, which is not the keyed answer.`;
  const difficulty: Difficulty = input.calibrated === "easy" || input.calibrated === "medium" || input.calibrated === "hard"
    ? input.calibrated
    : input.type === "essay" || /explain|compare|why|analyse|analyze/i.test(input.stem)
      ? "hard"
      : input.type === "true_false"
        ? "easy"
        : "medium";
  if (!notes.length) notes.push(ambiguous ? "Read the stem once as a candidate who has not studied this." : "No obvious ambiguity in the wording.");
  return { ambiguity: notes.join(" "), ambiguous, duplicates, wrongKey, difficulty, notes: notes.join(" ") };
}

export async function proposeQuality(actor: User, questionId: string) {
  const question = await getQuestion(actor, questionId);
  if (!question) return { ok: false as const, error: "not_found" };
  const others = await query(
    `select id, stem from questions where organization_id = $1 and id <> $2 and status <> 'draft' limit 80`,
    [question.organizationId, question.id],
  );
  const bank = others.map((row) => ({ id: String(row.id), stem: String(row.stem) }));
  if (aiConfigured()) {
    const asked = await askModel(
      'You review one exam question. Reply with JSON only: {"ambiguous":false,"ambiguity":"","duplicates":[{"id":"","stem":"","why":""}],"wrongKey":"","difficulty":"medium","notes":""}. difficulty is easy, medium, or hard. Use only duplicate ids from the list. wrongKey is empty when the key looks right.',
      JSON.stringify({
        question: { stem: question.stem, type: question.type, options: question.options, correct: question.correctOptionIds, explanation: question.explanation, difficulty: question.difficulty },
        bank,
      }),
    );
    if (!asked.ok) return asked;
    const difficulty = asked.data.difficulty === "easy" || asked.data.difficulty === "hard" ? asked.data.difficulty : "medium";
    const payload = {
      ambiguous: Boolean(asked.data.ambiguous),
      ambiguity: String(asked.data.ambiguity || asked.data.notes || ""),
      duplicates: Array.isArray(asked.data.duplicates) ? asked.data.duplicates : [],
      wrongKey: String(asked.data.wrongKey || ""),
      difficulty,
      notes: String(asked.data.notes || ""),
    };
    await storeSuggestion(actor, { organizationId: question.organizationId, kind: "quality", entity: "question", entityId: question.id, payload, source: "model" });
    return { ok: true as const };
  }
  await storeSuggestion(actor, {
    organizationId: question.organizationId,
    kind: "quality",
    entity: "question",
    entityId: question.id,
    payload: localQuality({
      stem: question.stem,
      type: question.type,
      options: question.options,
      correct: question.correctOptionIds,
      explanation: question.explanation,
      difficulty: question.difficulty,
      calibrated: question.calibratedDifficulty,
      others: bank,
    }),
    source: "local",
  });
  return { ok: true as const };
}

export async function applyDifficulty(actor: User, suggestionId: string) {
  const rows = await query(`select * from ai_suggestions where id = $1 and kind = 'quality'`, [suggestionId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const suggestion = mapSuggestion(rows[0]);
  const question = await getQuestion(actor, suggestion.entityId);
  if (!question) return { ok: false as const, error: "forbidden" };
  const difficulty = suggestion.payload.difficulty === "easy" || suggestion.payload.difficulty === "hard" || suggestion.payload.difficulty === "medium" ? suggestion.payload.difficulty : question.difficulty;
  await query(`update questions set difficulty = $2, updated_at = now() where id = $1`, [question.id, difficulty]);
  await setSuggestionStatus(actor, suggestion.id, "accepted");
  return { ok: true as const };
}

const LOCALE_NAME = { en: "English", am: "Amharic", om: "Afaan Oromo" } as const;

export async function proposeTranslation(actor: User, questionId: string, locale: "en" | "am" | "om") {
  if (!aiConfigured()) return { ok: false as const, error: "ai_disabled" };
  const question = await getQuestion(actor, questionId);
  if (!question) return { ok: false as const, error: "not_found" };
  const asked = await askModel(
    `You translate an exam question into ${LOCALE_NAME[locale]}. Reply with JSON only: {"stem":"","explanation":"","options":[{"id":"","text":""}],"accepted":[""],"pairs":[{"left":"","right":""}]}. Keep every option id. Do not change which answer is correct. Preserve names, numbers, and formulas.`,
    JSON.stringify({ stem: question.stem, explanation: question.explanation, options: question.options, accepted: question.acceptedAnswers, pairs: question.pairs.map((pair) => ({ left: pair.left, right: pair.right })) }),
  );
  if (!asked.ok) return asked;
  const payload = {
    locale,
    stem: String(asked.data.stem || "").trim(),
    explanation: String(asked.data.explanation || "").trim(),
    options: Array.isArray(asked.data.options) ? asked.data.options : question.options,
    accepted: Array.isArray(asked.data.accepted) ? asked.data.accepted.map(String) : [],
    pairs: Array.isArray(asked.data.pairs) ? asked.data.pairs : [],
  };
  if (payload.stem.length < 4) return { ok: false as const, error: "ai_failed" };
  await storeSuggestion(actor, { organizationId: question.organizationId, kind: "translation", entity: "question", entityId: question.id, payload, source: "model" });
  return { ok: true as const };
}

export async function acceptTranslation(actor: User, suggestionId: string) {
  const rows = await query(`select * from ai_suggestions where id = $1 and kind = 'translation'`, [suggestionId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const suggestion = mapSuggestion(rows[0]);
  const question = await getQuestion(actor, suggestion.entityId);
  if (!question) return { ok: false as const, error: "forbidden" };
  const options = Array.isArray(suggestion.payload.options)
    ? (suggestion.payload.options as { id?: string; text?: string }[]).map((option, index) => ({
        id: String(option.id || question.options[index]?.id || crypto.randomUUID()),
        text: String(option.text || ""),
      }))
    : question.options;
  const pairs = Array.isArray(suggestion.payload.pairs)
    ? (suggestion.payload.pairs as { left?: string; right?: string }[]).map((pair) => ({ id: crypto.randomUUID(), left: String(pair.left || ""), right: String(pair.right || "") }))
    : question.pairs;
  const saved = await saveQuestion(actor, {
    organizationId: question.organizationId,
    type: question.type,
    stem: String(suggestion.payload.stem || question.stem),
    explanation: String(suggestion.payload.explanation || ""),
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    options,
    correctOptionIds: question.correctOptionIds,
    acceptedAnswers: Array.isArray(suggestion.payload.accepted) ? suggestion.payload.accepted.map(String) : question.acceptedAnswers,
    pairs,
    mediaUrl: question.mediaUrl,
    mediaKind: question.mediaKind,
    mediaAlt: question.mediaAlt,
    points: question.points,
  });
  if (!saved.ok) return saved;
  await query(`update questions set status = 'draft' where id = $1`, [saved.id]);
  await setSuggestionStatus(actor, suggestion.id, "accepted");
  return { ok: true as const, id: saved.id };
}

export function localFeedback(input: { exam: string; percentage: number | null; topics: { topic: string; percent: number }[] }) {
  const strong = input.topics.filter((topic) => topic.percent >= 70).map((topic) => topic.topic);
  const weak = input.topics.filter((topic) => topic.percent < 50).map((topic) => topic.topic);
  const score = input.percentage == null ? "a mark that is still hidden" : `${input.percentage}%`;
  return {
    examTitle: input.exam,
    feedback: `On ${input.exam} the result was ${score}. Stronger topics: ${strong.slice(0, 4).join(", ") || "none stood out yet"}. Topics to revisit: ${weak.slice(0, 4).join(", ") || "none fell below half marks"}.`,
    recommendations: (weak.length ? weak : strong).slice(0, 4).map((topic) => `Review ${topic} before the next paper.`),
  };
}

export async function proposeFeedback(actor: User, input: { organizationId: string; attemptId: string; exam: string; percentage: number | null; topics: { topic: string; percent: number }[]; misses: string[] }) {
  if (aiConfigured()) {
    const asked = await askModel(
      'You write study feedback for one student. Reply with JSON only: {"feedback":"","recommendations":["",""]}. Be specific and kind. Do not invent scores that were not provided. A teacher will edit this before the student sees it.',
      JSON.stringify(input),
    );
    if (!asked.ok) return asked;
    const payload = {
      examTitle: input.exam,
      feedback: String(asked.data.feedback || "").slice(0, 2000),
      recommendations: Array.isArray(asked.data.recommendations) ? asked.data.recommendations.map(String).slice(0, 6) : [],
    };
    await storeSuggestion(actor, { organizationId: input.organizationId, kind: "feedback", entity: "attempt", entityId: input.attemptId, payload, source: "model" });
    return { ok: true as const };
  }
  await storeSuggestion(actor, { organizationId: input.organizationId, kind: "feedback", entity: "attempt", entityId: input.attemptId, payload: localFeedback(input), source: "local" });
  return { ok: true as const };
}

export async function publishFeedback(actor: User, suggestionId: string, feedback: string, recommendations: string) {
  const rows = await query(`select * from ai_suggestions where id = $1 and kind = 'feedback'`, [suggestionId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const current = mapSuggestion(rows[0]);
  const payload = {
    ...current.payload,
    feedback: feedback.trim().slice(0, 2000),
    recommendations: recommendations.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8),
  };
  const changed = payload.feedback !== String(current.payload.feedback || "");
  return setSuggestionStatus(actor, suggestionId, changed ? "edited" : "accepted", payload);
}

export function localPaper(blueprint: { topic: string; difficulty: string; count: number }[], bank: { id: string; stem: string; topic: string; subject: string; difficulty: string }[]) {
  const used = new Set<string>();
  const picked: typeof bank = [];
  const shortfalls: string[] = [];
  for (const row of blueprint) {
    const count = clamp(row.count, 20);
    const pool = bank.filter((item) => {
      if (used.has(item.id)) return false;
      const topic = row.topic.trim().toLowerCase();
      const topicOk = !topic || item.topic.toLowerCase().includes(topic) || item.subject.toLowerCase().includes(topic);
      const difficultyOk = !row.difficulty || item.difficulty === row.difficulty;
      return topicOk && difficultyOk;
    });
    const take = pool.slice(0, count);
    if (take.length < count) shortfalls.push(`${row.topic || "Any topic"} · ${row.difficulty || "any"}: found ${take.length} of ${count}.`);
    for (const item of take) {
      used.add(item.id);
      picked.push(item);
    }
  }
  return {
    questionIds: picked.map((item) => item.id),
    items: picked.map((item) => ({ id: item.id, stem: item.stem, topic: item.topic, difficulty: item.difficulty })),
    notes: shortfalls.length ? "The bank could not fill every row." : "Each row was filled from published questions.",
    shortfalls,
  };
}

export async function proposePaper(actor: User, examId: string, blueprint: { topic: string; difficulty: string; count: number }[]) {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false as const, error: "forbidden" };
  const rows = await query(
    `select id, stem, topic, subject, difficulty from questions where organization_id = $1 and status = 'published' order by topic, stem`,
    [exam.organizationId],
  );
  const bank = rows.map((row) => ({ id: String(row.id), stem: String(row.stem), topic: String(row.topic), subject: String(row.subject), difficulty: String(row.difficulty) }));
  const clean = blueprint.filter((row) => row.count > 0).slice(0, 8);
  if (!clean.length) return { ok: false as const, error: "validation" };
  if (aiConfigured()) {
    const asked = await askModel(
      'You assemble an exam from the given bank. Reply with JSON only: {"questionIds":[""],"notes":""}. Use only ids from the bank. Follow the blueprint counts, topics, and difficulties. Do not invent questions.',
      JSON.stringify({ blueprint: clean, bank: bank.map((item) => ({ id: item.id, topic: item.topic, subject: item.subject, difficulty: item.difficulty, stem: item.stem.slice(0, 180) })) }),
    );
    if (!asked.ok) return asked;
    const allowed = new Set(bank.map((item) => item.id));
    const questionIds = (Array.isArray(asked.data.questionIds) ? asked.data.questionIds.map(String) : []).filter((id) => allowed.has(id));
    const items = questionIds.map((id) => bank.find((item) => item.id === id)).filter((item): item is (typeof bank)[number] => Boolean(item));
    await storeSuggestion(actor, {
      organizationId: exam.organizationId,
      kind: "paper",
      entity: "exam",
      entityId: exam.id,
      payload: { questionIds, items, notes: String(asked.data.notes || ""), shortfalls: [] },
      source: "model",
    });
    return { ok: true as const };
  }
  await storeSuggestion(actor, { organizationId: exam.organizationId, kind: "paper", entity: "exam", entityId: exam.id, payload: localPaper(clean, bank), source: "local" });
  return { ok: true as const };
}

export async function acceptPaper(actor: User, suggestionId: string) {
  const rows = await query(`select * from ai_suggestions where id = $1 and kind = 'paper'`, [suggestionId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const suggestion = mapSuggestion(rows[0]);
  const exam = await getExam(suggestion.entityId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false as const, error: "forbidden" };
  if ((await attemptCount(exam.id)) > 0) return { ok: false as const, error: "locked" };
  const ids = Array.isArray(suggestion.payload.questionIds) ? suggestion.payload.questionIds.map(String) : [];
  const owned = ids.length
    ? await query(`select id, points from questions where organization_id = $1 and status = 'published' and id = any($2::text[])`, [exam.organizationId, ids])
    : [];
  if (owned.length !== ids.length) return { ok: false as const, error: "validation" };
  const points = new Map(owned.map((row) => [String(row.id), num(row.points, 1)]));
  await query(`delete from exam_questions where exam_id = $1`, [exam.id]);
  for (let index = 0; index < ids.length; index += 1) {
    await query(`insert into exam_questions (exam_id, question_id, sort_order, points) values ($1,$2,$3,$4)`, [exam.id, ids[index], index, points.get(ids[index]) ?? 1]);
  }
  await setSuggestionStatus(actor, suggestion.id, "accepted");
  return { ok: true as const };
}

export function localProctor(events: { name: string; kind: string }[]) {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.kind, (counts.get(event.kind) || 0) + 1);
  const bits = [...counts.entries()].map(([kind, count]) => `${count} ${kind.replaceAll("_", " ")}`);
  const people = [...new Set(events.map((event) => event.name))];
  return {
    summary: events.length
      ? `${events.length} signals across ${people.length} candidate${people.length === 1 ? "" : "s"}: ${bits.join(", ")}. Read the log before treating any sitting as misconduct.`
      : "No suspicious signals are logged for this exam.",
    followUp: people.slice(0, 5).map((name) => `Open ${name}'s events and decide whether a reset or a note is warranted.`),
  };
}

export async function proposeProctorSummary(actor: User, examId: string) {
  const exam = await getExam(examId);
  if (!exam || !managesOrg(actor, exam.organizationId)) return { ok: false as const, error: "forbidden" };
  const rows = await query(
    `select e.kind, e.detail, u.full_name, a.risk_score
     from proctor_events e
     join attempts a on a.id = e.attempt_id
     join users u on u.id = a.candidate_id
     where a.exam_id = $1 and e.kind <> 'camera_snapshot'
     order by e.created_at desc limit 80`,
    [examId],
  );
  const events = rows.map((row) => ({ name: String(row.full_name), kind: String(row.kind), detail: String(row.detail || ""), risk: num(row.risk_score) }));
  if (aiConfigured()) {
    const asked = await askModel(
      'You summarize exam proctor logs for a human reviewer. Reply with JSON only: {"summary":"","followUp":["",""]}. Do not accuse a candidate. Say what to check.',
      JSON.stringify(events),
    );
    if (!asked.ok) return asked;
    const payload = {
      summary: String(asked.data.summary || "").slice(0, 2000),
      followUp: Array.isArray(asked.data.followUp) ? asked.data.followUp.map(String).slice(0, 6) : [],
    };
    await storeSuggestion(actor, { organizationId: exam.organizationId, kind: "proctor", entity: "exam", entityId: exam.id, payload, source: "model" });
    return { ok: true as const };
  }
  await storeSuggestion(actor, { organizationId: exam.organizationId, kind: "proctor", entity: "exam", entityId: exam.id, payload: localProctor(events), source: "local" });
  return { ok: true as const };
}

export async function keepProctorNote(actor: User, suggestionId: string, summary: string) {
  const rows = await query(`select * from ai_suggestions where id = $1 and kind = 'proctor'`, [suggestionId]);
  if (!rows[0]) return { ok: false as const, error: "not_found" };
  const current = mapSuggestion(rows[0]);
  const payload = { ...current.payload, summary: summary.trim().slice(0, 2000) };
  return setSuggestionStatus(actor, suggestionId, summary.trim() === String(current.payload.summary || "") ? "accepted" : "edited", payload);
}

export async function acceptSuggestedGrade(actor: User, attemptId: string, questionId: string, points: number, comment: string, suggestionId: string) {
  const result = await gradeEssays(actor, attemptId, [{ questionId, points, comment }]);
  if (!result.ok || !suggestionId) return result;
  const rows = await query(`select payload from ai_suggestions where id = $1`, [suggestionId]);
  const suggested = num(parseJson<Record<string, unknown>>(rows[0]?.payload, {}).points);
  await setSuggestionStatus(actor, suggestionId, suggested === points ? "accepted" : "edited");
  return result;
}
