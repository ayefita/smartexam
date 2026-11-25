import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { getResultView } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser();
  const { attemptId } = await params;
  const view = await getResultView(user, attemptId);
  const { dict, locale } = await getDictionary();
  if (!view) return <p>{dict.errors.not_found}</p>;
  const message = view.message === "visible" ? "" : view.message === "pending_review" ? dict.release.pendingReview : view.message === "pending_both" ? fill(dict.release.pendingBoth, { date: formatAddis(view.exam.resultReleaseAt, locale), zone: dict.zone }) : fill(dict.release.waiting, { date: formatAddis(view.exam.resultReleaseAt, locale), zone: dict.zone });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={view.exam.title} lede={view.attempt.candidateName} actions={view.showScore && view.attempt.gradingStatus === "finalized" ? <Button className="h-10" render={<Link href={`/api/certificates/${view.attempt.id}`} />}>{dict.results.slip}</Button> : null} />
      {view.showScore && view.attempt.gradingStatus === "finalized" ? (
        <article className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">{dict.results.score}</p>
          <p className="font-heading text-4xl">{view.attempt.percentage}%</p>
          <p className="mt-1">{view.attempt.score} / {view.attempt.maxScore}</p>
          <div className="mt-3"><Pill tone={view.attempt.passed ? "good" : "bad"}>{view.attempt.passed ? dict.status.passed : dict.status.failed}</Pill></div>
          {view.attempt.verificationCode ? <p className="mt-3 font-mono text-sm">{dict.results.code}: {view.attempt.verificationCode}</p> : null}
        </article>
      ) : <p className="rounded-2xl bg-[#f8efd4] p-4 text-sm" role="status">{message}</p>}
      {view.showScore ? (
        <section className="mt-6 grid gap-4">
          <h2 className="font-heading text-xl">{dict.results.review}</h2>
          {view.review.map(({ question, answer }) => (
            <article key={question.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground">{dict.qtype[question.type]} · {question.topic}</p>
              <h3 className="mt-1 whitespace-pre-wrap font-medium">{question.stem}</h3>
              <p className="mt-2 text-sm">{dict.results.yourAnswer}: {answer?.textAnswer || answer?.selectedOptionIds.map((id) => question.options.find((option) => option.id === id)?.text || (id === "true" ? dict.player.true : id === "false" ? dict.player.false : id)).join(", ") || (question.type === "matching" ? question.pairs.map((pair) => `${pair.left} → ${question.pairs.find((item) => item.id === answer?.matching?.[pair.id])?.right || "—"}`).join("; ") : "—")}</p>
              {question.type !== "essay" ? <p className="text-sm">{dict.results.correct}: {question.type === "short" || question.type === "blank" ? question.acceptedAnswers.join(" / ") : question.type === "matching" ? question.pairs.map((pair) => `${pair.left} → ${pair.right}`).join("; ") : question.options.filter((option) => question.correctOptionIds.includes(option.id)).map((option) => option.text).join(", ")}</p> : null}
              <p className="mt-1 text-sm">{answer?.pointsAwarded ?? 0} / {question.points} {answer?.isCorrect ? `· ${dict.status.passed}` : ""}</p>
              {answer?.manualComment ? <p className="mt-1 text-sm text-muted-foreground">{dict.results.comment}: {answer.manualComment}</p> : null}
              {question.explanation ? <p className="mt-2 text-sm">{question.explanation}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
