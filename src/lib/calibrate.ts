import { query } from "./db";
import { num, parseJson } from "./format";
import type { Difficulty, PaperQuestion } from "./types";

export function calibrateLevel(rate: number): Difficulty {
  if (rate >= 0.8) return "easy";
  if (rate >= 0.45) return "medium";
  return "hard";
}

export async function calibrateQuestions(questionIds: string[]) {
  const ids = [...new Set(questionIds.filter(Boolean))];
  for (const id of ids) {
    const rows = await query(
      `select a.is_correct, a.points_awarded, t.paper
       from answers a
       join attempts t on t.id = a.attempt_id
       where a.question_id = $1 and t.status = 'submitted' and a.is_correct is not null`,
      [id],
    );
    let asked = 0;
    let correct = 0;
    for (const row of rows) {
      const paper = parseJson<PaperQuestion[]>(row.paper, []);
      const question = paper.find((item) => item.id === id);
      if (!question || question.type === "essay") continue;
      asked += 1;
      if (row.is_correct === true || row.is_correct === "t" || row.is_correct === "true") correct += 1;
      else if (question.points > 0 && num(row.points_awarded) >= question.points) correct += 1;
    }
    if (!asked) continue;
    const rate = correct / asked;
    await query(
      `update questions set times_asked = $2, observed_rate = $3, calibrated_difficulty = $4, updated_at = now() where id = $1`,
      [id, asked, Math.round(rate * 1000) / 10, asked >= 2 ? calibrateLevel(rate) : ""],
    );
  }
}
