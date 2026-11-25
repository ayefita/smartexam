import type { QueryFn } from "./db";
import { query as defaultQuery } from "./db";
import { answersMatch, bool, num, parseJson, sameSet } from "./format";
import type { Answer, PaperQuestion } from "./types";

export type ScorePart = {
  correct: boolean | null;
  points: number | null;
  pending: boolean;
};

export function scoreQuestion(
  question: PaperQuestion,
  answer: Pick<Answer, "selectedOptionIds" | "textAnswer" | "matching" | "pointsAwarded">,
): ScorePart {
  const pts = question.points;
  if (question.type === "essay") {
    if (answer.pointsAwarded == null) return { correct: null, points: null, pending: true };
    const awarded = Math.max(0, Math.min(pts, answer.pointsAwarded));
    return { correct: awarded >= pts, points: awarded, pending: false };
  }
  if (question.type === "short" || question.type === "blank") {
    const ok = question.acceptedAnswers.some((accepted) => answersMatch(answer.textAnswer, accepted));
    return { correct: ok, points: ok ? pts : 0, pending: false };
  }
  if (question.type === "matching") {
    if (!question.pairs.length) return { correct: true, points: pts, pending: false };
    const right = question.pairs.filter((pair) => answer.matching[pair.id] === pair.id).length;
    const points = (pts * right) / question.pairs.length;
    return { correct: right === question.pairs.length, points, pending: false };
  }
  const ok = sameSet(question.correctOptionIds, answer.selectedOptionIds);
  return { correct: ok, points: ok ? pts : 0, pending: false };
}

type AttemptRow = {
  id: string;
  exam_id: string;
  paper: unknown;
  pass_mark: unknown;
  negative_mark?: unknown;
};

function mapAnswer(row: Record<string, unknown>): Answer {
  return {
    attemptId: String(row.attempt_id),
    questionId: String(row.question_id),
    selectedOptionIds: parseJson<string[]>(row.selected_option_ids, []),
    textAnswer: String(row.text_answer ?? ""),
    matching: parseJson<Record<string, string>>(row.matching, {}),
    flagged: bool(row.flagged),
    isCorrect: row.is_correct == null ? null : bool(row.is_correct),
    pointsAwarded: row.points_awarded == null ? null : num(row.points_awarded),
    manualComment: String(row.manual_comment ?? ""),
    updatedAt: "",
  };
}

export async function gradeAttempt(attemptId: string, q: QueryFn = defaultQuery) {
  const rows = (await q(
    `select a.id, a.exam_id, a.paper, e.pass_mark, e.negative_mark
     from attempts a join exams e on e.id = a.exam_id
     where a.id = $1`,
    [attemptId],
  )) as AttemptRow[];
  const attempt = rows[0];
  if (!attempt) return;
  const paper = parseJson<PaperQuestion[]>(attempt.paper, []);
  const answerRows = await q(`select * from answers where attempt_id = $1`, [attemptId]);
  const answers = new Map(answerRows.map((row) => [String(row.question_id), mapAnswer(row)]));

  let score = 0;
  let max = 0;
  let pending = false;
  const negative = Math.max(0, Math.min(1, num(attempt.negative_mark, 0)));
  const graded: { qid: string; ok: boolean | null; pts: number | null }[] = [];

  for (const question of paper) {
    max += question.points;
    const answer = answers.get(question.id) ?? {
      attemptId,
      questionId: question.id,
      selectedOptionIds: [],
      textAnswer: "",
      matching: {},
      flagged: false,
      isCorrect: null,
      pointsAwarded: null,
      manualComment: "",
      updatedAt: "",
    };
    const part = scoreQuestion(question, answer);
    // Negative marking only touches choice questions the student actually answered wrong.
    const choice = question.type === "single" || question.type === "multiple" || question.type === "true_false";
    if (negative > 0 && choice && part.correct === false && answer.selectedOptionIds.length > 0) {
      part.points = -Math.round(question.points * negative * 100) / 100;
    }
    if (part.pending) pending = true;
    else score += part.points ?? 0;
    graded.push({ qid: question.id, ok: part.correct, pts: part.points });
  }

  // One statement for the whole paper, so 400 students submitting at the bell stay fast.
  if (graded.length) {
    await q(
      `insert into answers (attempt_id, question_id, selected_option_ids, text_answer, matching, flagged, is_correct, points_awarded, manual_comment)
       select $1, r.qid, '[]'::jsonb, '', '{}'::jsonb, false, r.ok, r.pts, ''
       from jsonb_to_recordset($2::jsonb) as r(qid text, ok boolean, pts numeric)
       on conflict (attempt_id, question_id) do update set
         is_correct = excluded.is_correct, points_awarded = excluded.points_awarded, updated_at = now()`,
      [attemptId, JSON.stringify(graded)],
    );
  }
  score = Math.max(0, Math.round(score * 100) / 100);

  const passMark = num(attempt.pass_mark, 50);
  const percentage = !pending && max > 0 ? Math.round((score / max) * 1000) / 10 : null;
  const passed = percentage == null ? null : percentage + 1e-9 >= passMark;

  await q(
    `update attempts
     set score = $1, max_score = $2, percentage = $3, passed = $4, grading_status = $5
     where id = $6`,
    [score, max, percentage, passed, pending ? "pending_manual" : "finalized", attemptId],
  );
}
