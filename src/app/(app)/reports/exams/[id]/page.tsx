import Link from "next/link";
import { keepProctorAction, summarizeProctorAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui-app";
import { latestSuggestion } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { examReport } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function ExamReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const report = await examReport(user, id);
  const { dict } = await getDictionary();
  if (!report) return <p>{dict.errors.not_found}</p>;
  const maxBucket = Math.max(1, ...report.distribution.map((bucket) => bucket.count));
  const summary = await latestSuggestion("proctor", id);
  const followUp = Array.isArray(summary?.payload.followUp) ? summary.payload.followUp.map(String) : [];
  return (
    <div>
      <PageHeader title={report.exam.title} lede={dict.reports.title} actions={
        <div className="flex gap-2">
          <Button variant="outline" className="h-9" render={<a href={`/api/reports/exams/${id}?format=csv`} />}>{dict.common.exportCsv}</Button>
          <Button variant="outline" className="h-9" render={<a href={`/api/reports/exams/${id}?format=xlsx`} />}>{dict.common.exportXlsx}</Button>
          <Button variant="outline" className="h-9" render={<a href={`/api/reports/exams/${id}?format=pdf`} />}>{dict.common.exportPdf}</Button>
        </div>
      } />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [dict.reports.average, report.average == null ? "—" : `${report.average}%`],
          [dict.reports.passRate, report.passRate == null ? "—" : `${report.passRate}%`],
          [dict.reports.highest, report.highest == null ? "—" : `${report.highest}%`],
          [dict.exams.attempts, String(report.submitted)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-3xl">{value}</p></article>
        ))}
      </div>
      <h2 className="mt-8 font-heading text-xl">{dict.reports.distribution}</h2>
      <div className="mt-3 grid gap-2">
        {report.distribution.map((bucket) => (
          <div key={bucket.label} className="grid grid-cols-[4rem_1fr_2rem] items-center gap-2 text-sm">
            <span>{bucket.label}</span>
            <div className="h-3 rounded-full bg-muted"><div className="h-3 rounded-full bg-primary" style={{ width: `${(bucket.count / maxBucket) * 100}%` }} /></div>
            <span>{bucket.count}</span>
          </div>
        ))}
      </div>
      <h2 className="mt-8 font-heading text-xl">{dict.reports.rank}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-2">{dict.reports.rank}</th><th>{dict.common.name}</th><th>{dict.results.score}</th><th>{dict.reports.switches}</th><th>{dict.reports.suspicious}</th></tr></thead>
          <tbody>
            {report.ranked.map((attempt) => (
              <tr key={attempt.id} className="border-b">
                <td className="py-2">{attempt.rank}</td>
                <td><Link href={`/reports/candidates/${attempt.candidateId}`} className="underline-offset-4 hover:underline">{attempt.candidateName}</Link></td>
                <td>{attempt.percentage}% · {attempt.passed ? dict.status.passed : dict.status.failed}</td>
                <td>{attempt.tabSwitchCount}</td>
                <td>{attempt.suspiciousCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-heading text-xl">{dict.reports.topics}</h2>
      <ul className="mt-2 grid gap-1 text-sm">
        {report.topics.map((topic) => <li key={topic.topic}>{topic.topic}: {topic.possible ? Math.round((topic.earned / topic.possible) * 100) : 0}%</li>)}
      </ul>
      <h2 className="mt-8 font-heading text-xl">{dict.reports.questions}</h2>
      <ul className="mt-2 grid gap-2 text-sm">
        {report.questions.map((question) => <li key={question.id} className="rounded-lg bg-card p-3 ring-1 ring-foreground/10">{question.stem}<span className="mt-1 block text-muted-foreground">{dict.reports.asked} {question.asked} · {dict.reports.correctRate} {question.asked ? Math.round((question.correct / question.asked) * 100) : 0}%</span></li>)}
      </ul>
      <section className="mt-8 grid max-w-3xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-xl">{dict.assist.proctor}</h2>
        <p className="text-sm text-muted-foreground">{dict.assist.proctorb}</p>
        <form action={summarizeProctorAction}><input type="hidden" name="examId" value={id} /><Button type="submit" variant="outline" className="h-10">{dict.assist.summarize}</Button></form>
        {summary && summary.status !== "dismissed" ? (
          <form action={keepProctorAction} className="grid gap-2">
            <input type="hidden" name="examId" value={id} />
            <input type="hidden" name="suggestionId" value={summary.id} />
            <AssistNote source={summary.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
            <Textarea name="summary" defaultValue={String(summary.payload.summary || "")} />
            {followUp.length ? <ul className="text-sm">{followUp.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            <Button type="submit" className="h-10 w-fit">{dict.assist.keep}</Button>
          </form>
        ) : null}
      </section>
      <h2 className="mt-8 font-heading text-xl">{dict.reports.proctor}</h2>
      <ul className="mt-2 grid gap-3">
        {report.events.map((event) => (
          <li key={event.id} className="rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10">
            <p>{event.candidateName} · {event.kind} · {event.createdAt}</p>
            {event.detail ? <p className="text-muted-foreground">{event.detail}</p> : null}
            {event.snapshot ? <img src={event.snapshot} alt="" className="mt-2 h-24 rounded-md" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
