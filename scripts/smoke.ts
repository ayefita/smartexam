import { query, ensureReady } from "../src/lib/db";
import { candidateCanSeeScore, defaultReleaseAt } from "../src/lib/results";
import { num } from "../src/lib/format";

async function main() {
  await ensureReady();
  const exams = await query<{ id: string; title: string; result_release: string; result_release_at: unknown; end_at: unknown }>(
    `select id, title, result_release, result_release_at, end_at from exams order by title`,
  );
  console.log(
    exams.map((exam) => ({
      id: exam.id,
      release: exam.result_release,
      end: exam.end_at,
      at: exam.result_release_at,
    })),
  );
  const entrance = exams.find((exam) => exam.id === "ex_entrance");
  const job = exams.find((exam) => exam.id === "ex_job");
  const exitExam = exams.find((exam) => exam.id === "ex_exit");
  if (!entrance || !job || !exitExam) throw new Error("missing exams");
  if (exitExam.result_release !== "instant") throw new Error("exit should be instant");
  const expected = defaultReleaseAt(new Date(String(entrance.end_at)).toISOString());
  const actual = new Date(String(entrance.result_release_at)).getTime();
  if (Math.abs(actual - new Date(expected).getTime()) > 1000) {
    throw new Error(`entrance release ${entrance.result_release_at} != ${expected}`);
  }
  const attempts = await query<{ id: string; passed: unknown; percentage: unknown; grading_status: string; result_release: string; result_release_at: unknown; status: string }>(
    `select a.id, a.passed, a.percentage, a.grading_status, a.status, e.result_release, e.result_release_at
     from attempts a join exams e on e.id = a.exam_id order by a.id`,
  );
  for (const attempt of attempts) {
    const visible = candidateCanSeeScore(
      {
        resultRelease: attempt.result_release === "scheduled" ? "scheduled" : "instant",
        resultReleaseAt: attempt.result_release_at ? new Date(String(attempt.result_release_at)).toISOString() : null,
      },
      { status: "submitted", gradingStatus: attempt.grading_status === "finalized" ? "finalized" : "pending_manual" },
    );
    console.log(attempt.id, "pct", num(attempt.percentage), "passed", attempt.passed, "visible", visible, attempt.grading_status);
  }
  const users = await query(`select count(*) as n from users`);
  const questions = await query(`select count(*) as n from questions`);
  console.log("users", num(users[0]?.n), "questions", num(questions[0]?.n));
  if (num(users[0]?.n) !== 5) throw new Error("user count");
  const liyaExit = attempts.find((attempt) => attempt.id === "att_liya_exit");
  const liyaEnt = attempts.find((attempt) => attempt.id === "att_liya_ent");
  const liyaJob = attempts.find((attempt) => attempt.id === "att_liya_job");
  if (!liyaExit || !candidateCanSeeScore(
    { resultRelease: "instant", resultReleaseAt: null },
    { status: "submitted", gradingStatus: "finalized" },
  )) throw new Error("instant visibility");
  if (num(liyaExit?.percentage) < 80) throw new Error("liya exit score");
  if (liyaEnt && candidateCanSeeScore(
    { resultRelease: "scheduled", resultReleaseAt: new Date(String(liyaEnt.result_release_at)).toISOString() },
    { status: "submitted", gradingStatus: "finalized" },
  )) throw new Error("entrance should still be hidden");
  if (!candidateCanSeeScore(
    { resultRelease: "scheduled", resultReleaseAt: new Date(String(job?.result_release_at)).toISOString() },
    { status: "submitted", gradingStatus: "finalized" },
  )) throw new Error("recruitment should already be visible");
  console.log("smoke ok", { entranceRelease: expected, jobRelease: job?.result_release_at });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
