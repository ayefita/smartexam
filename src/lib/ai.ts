import type { QuestionInput } from "./domain";

const TYPES = new Set(["single", "multiple", "true_false", "short", "blank", "matching", "essay"]);

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
}

export async function pdfToText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : String(extracted.text || "");
  return text.replace(/\s+\n/g, "\n").trim().slice(0, 12000);
}

function jsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function askModel(system: string, user: string) {
  const key = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
  if (!key) return { ok: false as const, error: "ai_disabled" };
  const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user.slice(0, 14000) },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) return { ok: false as const, error: "ai_failed" };
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const data = jsonObject(String(payload.choices?.[0]?.message?.content || ""));
  if (!data) return { ok: false as const, error: "ai_failed" };
  return { ok: true as const, data };
}

function asQuestion(raw: unknown, fallback: { topic: string; subject: string; difficulty: string; type: string }): QuestionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = TYPES.has(String(row.type)) ? String(row.type) : fallback.type;
  if (!TYPES.has(type)) return null;
  const stem = String(row.stem || "").trim();
  if (stem.length < 8) return null;
  const optionText = Array.isArray(row.options) ? row.options.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [];
  const options = optionText.map((text) => ({ id: crypto.randomUUID(), text }));
  const indexes = Array.isArray(row.correct) ? row.correct.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item < options.length) : [];
  let correctOptionIds = indexes.map((index) => options[index].id);
  if (type === "true_false") {
    const correctRaw = Array.isArray(row.correct) ? row.correct[0] : row.correct;
    const answer = String(row.answer || correctRaw || "").toLowerCase();
    const truth = answer === "false" || answer === "0" || indexes[0] === 1 ? "false" : "true";
    correctOptionIds = [truth];
  }
  if (type === "single" && correctOptionIds.length > 1) correctOptionIds = correctOptionIds.slice(0, 1);
  const pairs = Array.isArray(row.pairs)
    ? row.pairs
        .map((pair) => {
          const item = pair as { left?: string; right?: string };
          return { id: crypto.randomUUID(), left: String(item?.left || "").trim(), right: String(item?.right || "").trim() };
        })
        .filter((pair) => pair.left && pair.right)
        .slice(0, 8)
    : [];
  const accepted = Array.isArray(row.accepted) ? row.accepted.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [];
  return {
    organizationId: "",
    type,
    stem,
    explanation: String(row.explanation || "").trim().slice(0, 2000),
    subject: fallback.subject || fallback.topic,
    topic: String(row.topic || fallback.topic).trim().slice(0, 80) || fallback.topic,
    difficulty: fallback.difficulty,
    options,
    correctOptionIds,
    acceptedAnswers: accepted,
    pairs,
    mediaUrl: "",
    mediaKind: "",
    mediaAlt: "",
    points: type === "essay" ? 5 : 1,
  };
}

export async function generateQuestionDrafts(input: {
  topic: string;
  subject: string;
  difficulty: string;
  count: number;
  type: string;
  source: string;
}) {
  if (!aiConfigured()) return { ok: false as const, error: "ai_disabled" };
  const count = Math.min(12, Math.max(1, Math.round(input.count) || 1));
  const type = TYPES.has(input.type) ? input.type : "single";
  const asked = await askModel(
    'You write exam questions and reply with one JSON object only: {"questions":[{"stem":"","type":"single","options":["",""],"correct":[0],"accepted":[],"pairs":[{"left":"","right":""}],"explanation":"","topic":""}]}. Types are single, multiple, true_false, short, blank, matching, essay. correct holds option indexes. For true_false set answer to true or false. Ground questions in the source text when one is provided. Do not invent a second document.',
    `Topic: ${input.topic}\nSubject: ${input.subject || input.topic}\nDifficulty: ${input.difficulty}\nCount: ${count}\nQuestion type: ${type}\nSource text:\n${input.source.slice(0, 12000) || "(none)"}`,
  );
  if (!asked.ok) return asked;
  const parsed = asked.data;
  const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const questions = list
    .slice(0, count)
    .map((item) => asQuestion(item, { topic: input.topic, subject: input.subject || input.topic, difficulty: input.difficulty, type }))
    .filter((item): item is QuestionInput => Boolean(item));
  if (!questions.length) return { ok: false as const, error: "ai_failed" };
  return { ok: true as const, questions };
}
