import Link from "next/link";
import { keepProctorAction, summarizeProctorAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Pill } from "@/components/ui-app";
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
  const w = dict.world.items;
  const letters = "ABCDEFGHIJ";
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          [dict.exams.attempts, String(report.submitted)],
          [dict.reports.passRate, report.passRate == null ? "—" : `${report.passRate}%`],
          [dict.reports.average, report.average == null ? "—" : `${report.average}%`],
          [w.median, report.median == null ? "—" : `${report.median}%`],
          [dict.reports.highest, report.highest == null ? "—" : `${report.highest}%`],
          [w.lowest, report.lowest == null ? "—" : `${report.lowest}%`],
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
      <section className="mt-8" id="item-analysis">
        <h2 className="font-heading text-xl">{w.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{w.lead}</p>
        {report.items.length ? (
          <div className="mt-3 overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{w.question}</th>
                  <th className="px-3 py-2" title={w.pHelp}>{w.p}</th>
                  <th className="px-3 py-2" title={w.dHelp}>{w.d}</th>
                  <th className="px-3 py-2">{w.choices}</th>
                  <th className="px-3 py-2">{w.note}</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => {
                  const most = Math.max(1, ...item.choices.map((choice) => choice.count), item.blank);
                  return (
                    <tr key={item.id} className="border-b align-top last:border-0">
                      <td className="px-3 py-3 text-muted-foreground">{item.no}</td>
                      <td className="max-w-sm px-3 py-3">
                        <p className="line-clamp-3">{item.stem}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{dict.difficulty[item.difficulty as keyof typeof dict.difficulty] || item.difficulty} · {dict.reports.asked} {item.asked}</p>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{item.p == null ? "—" : `${Math.round(item.p * 100)}%`}</td>
                      <td className={`px-3 py-3 tabular-nums ${item.d != null && item.d < 0.2 ? "text-[#8e1e32]" : ""}`}>{item.d == null ? "—" : item.d.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        {item.choices.length ? (
                          <ul className="grid min-w-48 gap-1">
                            {item.choices.map((choice, index) => (
                              <li key={choice.id} className="grid grid-cols-[1.5rem_1fr_2rem] items-center gap-2 text-xs" title={choice.text}>
                                <span className={choice.correct ? "font-semibold text-[#0c5c40]" : ""}>{letters[index] || index + 1}{choice.correct ? " ✓" : ""}</span>
                                <span className="h-2.5 rounded-full bg-muted"><span className={`block h-2.5 rounded-full ${choice.correct ? "bg-[#0c7a52]" : "bg-[#b8860b]"}`} style={{ width: `${(choice.count / most) * 100}%` }} /></span>
                                <span className="tabular-nums">{choice.count}</span>
                              </li>
                            ))}
                            <li className="grid grid-cols-[1.5rem_1fr_2rem] items-center gap-2 text-xs text-muted-foreground"><span>—</span><span>{w.blank}</span><span className="tabular-nums">{item.blank}</span></li>
                          </ul>
                        ) : <span className="text-xs text-muted-foreground">{w.blank}: {item.blank}</span>}
                      </td>
                      <td className="px-3 py-3"><Pill tone={item.flag === "good" ? "good" : item.flag === "key" ? "bad" : item.flag === "few" ? "neutral" : "wait"}>{w.flags[item.flag]}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">{w.empty}</p>}
      </section>
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
