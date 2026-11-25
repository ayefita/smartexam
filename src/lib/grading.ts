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
    `select a.id, a.exam_id, a.paper, e.pass_mark
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

  for (const question of paper) {
    max += question.points;
    const existing = answers.get(question.id);
    const answer = existing ?? {
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
    if (part.pending) pending = true;
    else score += part.points ?? 0;

    if (existing) {
      await q(
        `update answers set is_correct = $1, points_awarded = $2, updated_at = now()
         where attempt_id = $3 and question_id = $4`,
        [part.correct, part.points, attemptId, question.id],
      );
    } else {
      await q(
        `insert into answers (attempt_id, question_id, selected_option_ids, text_answer, matching, flagged, is_correct, points_awarded, manual_comment)
         values ($1, $2, '[]'::jsonb, '', '{}'::jsonb, false, $3, $4, '')`,
        [attemptId, question.id, part.correct, part.points],
      );
    }
  }

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
