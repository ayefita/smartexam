import Link from "next/link";
import { publishFeedbackAction, suggestFeedbackAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui-app";
import { suggestionsFor } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { candidateHistory, cohortAverages, topicStrength } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function CandidateReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const history = await candidateHistory(user, id);
  const { dict, locale } = await getDictionary();
  if (!history) return <p>{dict.errors.forbidden}</p>;
  const topics = await topicStrength(user, id);
  const averages = await cohortAverages(history.items.map((item) => item.examId));
  const visible = history.items.filter((item) => item.showScore && item.percentage != null);
  const yours = visible.length ? Math.round((visible.reduce((sum, item) => sum + (item.percentage || 0), 0) / visible.length) * 10) / 10 : null;
  const cohortValues = visible.map((item) => averages.get(item.examId)).filter((value): value is number => value != null);
  const cohort = cohortValues.length ? Math.round((cohortValues.reduce((sum, value) => sum + value, 0) / cohortValues.length) * 10) / 10 : null;
  const feedback = await suggestionsFor("feedback", history.items.map((item) => item.attemptId));
  const staff = user.role !== "candidate";
  return (
    <div>
      <PageHeader title={history.person.fullName} lede={history.person.email} actions={<Button variant="outline" className="h-10" render={<Link href={`/api/reports/candidates/${history.person.id}/pdf`} />}>{dict.features.pdf}</Button>} />
      <p className="mb-4 text-sm">{dict.features.yours} {yours ?? "—"}% · {dict.features.cohort} {cohort ?? "—"}%</p>
      <ul className="grid gap-2">
        {history.items.map((item) => (
          <li key={item.attemptId} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <Link href={`/results/${item.attemptId}`} className="font-medium underline-offset-4 hover:underline">{item.title}</Link>
            <p className="text-sm text-muted-foreground">{item.organizationName} · {formatAddis(item.submittedAt || item.startedAt, locale)}</p>
            <p className="text-sm">{item.showScore ? `${dict.features.yours} ${item.percentage}% · ${dict.features.cohort} ${averages.get(item.examId) ?? "—"}% · ${item.passed ? dict.status.passed : dict.status.failed}` : item.resultRelease === "scheduled" ? dict.release.scheduled : dict.status.pending}</p>
            {staff && item.showScore ? (
              <form action={suggestFeedbackAction} className="mt-2"><input type="hidden" name="candidateId" value={history.person.id} /><input type="hidden" name="attemptId" value={item.attemptId} /><Button type="submit" variant="outline" size="sm">{dict.assist.feedbackButton}</Button></form>
            ) : null}
            {(() => {
              const note = feedback.get(item.attemptId);
              if (!note || note.status === "dismissed") return null;
              if (!staff && (!item.showScore || note.status === "suggested")) return null;
              const recommendations = Array.isArray(note.payload.recommendations) ? note.payload.recommendations.map(String).join("\n") : "";
              if (!staff) {
                return (
                  <div className="mt-3 grid gap-2 text-sm">
                    <p className="font-medium">{dict.assist.feedback}</p>
                    <p className="whitespace-pre-wrap">{String(note.payload.feedback || "")}</p>
                    {recommendations ? <p className="whitespace-pre-wrap text-muted-foreground">{recommendations}</p> : null}
                  </div>
                );
              }
              return (
                <form action={publishFeedbackAction} className="mt-3 grid gap-2">
                  <AssistNote source={note.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
                  <p className="text-xs text-muted-foreground">{dict.assist.hidden}</p>
                  <Textarea name="feedback" defaultValue={String(note.payload.feedback || "")} />
                  <Textarea name="recommendations" aria-label={dict.assist.recommendations} defaultValue={recommendations} />
                  <input type="hidden" name="candidateId" value={history.person.id} />
                  <input type="hidden" name="suggestionId" value={note.id} />
                  <Button type="submit" className="h-10 w-fit">{dict.assist.publish}</Button>
                </form>
              );
            })()}
          </li>
        ))}
      </ul>
      {topics && topics.topics.length ? (
        <section className="mt-6">
          <h2 className="font-heading text-xl">{dict.dash.topicTitle}</h2>
          {topics.topics.map((topic) => <p key={topic.topic} className="text-sm">{topic.topic}: {topic.possible ? Math.round((topic.earned / topic.possible) * 100) : 0}%</p>)}
        </section>
      ) : null}
    </div>
  );
}
