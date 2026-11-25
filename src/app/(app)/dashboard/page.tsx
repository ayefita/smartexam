import Link from "next/link";
import { restoreAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { dashboardCounts, listExams, listMyExams, topicStrength } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";
import { candidateResultState } from "@/lib/results";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ forbidden?: string; error?: string }> }) {
  const user = await requireUser();
  const { dict, locale } = await getDictionary();
  const params = await searchParams;
  const error = params.forbidden ? dict.errors.forbidden : params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : "";
  if (user.role === "candidate") {
    const exams = await listMyExams(user);
    const topics = await topicStrength(user, user.id);
    return (
      <div>
        <PageHeader title={`${dict.dash.hello}, ${user.fullName}`} lede={dict.dash.candidateLead} />
        <Notice error text={error} />
        <h2 className="mb-3 font-heading text-xl">{dict.dash.openExams}</h2>
        {exams.length === 0 ? <p className="text-sm text-muted-foreground">{dict.dash.noExams}</p> : (
          <div className="grid gap-3">
            {exams.map((card) => {
              const state = card.attemptStatus === "submitted" ? candidateResultState(card.exam, { status: "submitted", gradingStatus: card.gradingStatus === "finalized" ? "finalized" : "pending_manual" }) : null;
              const href = card.attemptStatus === "submitted" ? `/results/${card.attemptId}` : card.attemptStatus === "in_progress" ? `/attempt/${card.attemptId}` : `/take/${card.exam.id}`;
              const action = card.attemptStatus === "submitted" ? dict.exams.results : card.attemptStatus === "in_progress" ? dict.exams.resume : card.window === "open" ? dict.exams.take : card.window === "upcoming" ? dict.status.upcoming : dict.status.closed;
              return (
                <article key={card.exam.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-heading text-xl">{card.exam.title}</h3>
                      <p className="text-sm text-muted-foreground">{card.exam.organizationName} · {card.exam.durationMinutes} {dict.common.minutes}</p>
                      <p className="mt-1 text-sm">{card.exam.resultRelease === "instant" ? dict.release.seeNow : fill(dict.release.seeOn, { date: formatAddis(card.exam.resultReleaseAt, locale), zone: dict.zone })}</p>
                      {state === "pending_release" ? <p className="mt-1 text-sm" role="status">{fill(dict.release.waiting, { date: formatAddis(card.exam.resultReleaseAt, locale), zone: dict.zone })}</p> : null}
                      {card.showScore ? <p className="mt-2 text-sm font-medium">{card.percentage}% · {card.passed ? dict.status.passed : dict.status.failed}</p> : null}
                    </div>
                    <Button className="h-10" render={<Link href={href} />}>{action}</Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <h2 className="mt-8 mb-3 font-heading text-xl">{dict.dash.topicTitle}</h2>
        {!topics || topics.topics.length === 0 ? <p className="text-sm text-muted-foreground">{dict.dash.topicEmpty}</p> : (
          <div className="grid gap-2">
            {topics.topics.map((topic) => {
              const pct = topic.possible ? Math.round((topic.earned / topic.possible) * 100) : 0;
              return (
                <div key={topic.topic}>
                  <div className="flex justify-between text-sm"><span>{topic.topic}</span><span>{pct}% · {pct >= 70 ? dict.dash.strong : dict.dash.weak}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  const counts = await dashboardCounts(user);
  const exams = await listExams(user);
  const stats = [
    [dict.dash.countsOrgs, counts.organizations],
    [dict.dash.countsUsers, counts.users],
    [dict.dash.countsQuestions, counts.questions],
    [dict.dash.countsExams, counts.exams],
    [dict.dash.countsAttempts, counts.attempts],
  ];
  return (
    <div>
      <PageHeader title={`${dict.dash.hello}, ${user.fullName}`} lede={user.role === "super_admin" ? dict.dash.adminLead : dict.dash.managerLead} actions={<Button className="h-10" render={<Link href="/exams/new" />}>{dict.exams.new}</Button>} />
      <Notice error text={error} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-heading text-3xl">{value}</p>
          </article>
        ))}
      </div>
      <h2 className="mt-8 mb-3 font-heading text-xl">{dict.exams.title}</h2>
      <div className="grid gap-3">
        {exams.slice(0, 6).map((exam) => (
          <Link key={exam.id} href={`/exams/${exam.id}`} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-heading text-lg">{exam.title}</h3>
              <Pill>{dict.status[exam.status]}</Pill>
              <Pill tone={exam.resultRelease === "instant" ? "good" : "wait"}>{exam.resultRelease === "instant" ? dict.release.instant : dict.release.scheduled}</Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{exam.organizationName}{exam.resultRelease === "scheduled" ? ` · ${formatAddis(exam.resultReleaseAt, locale)}` : ""}</p>
          </Link>
        ))}
      </div>
      {user.role === "super_admin" ? (
        <form action={restoreAction} className="mt-8 max-w-xl rounded-2xl bg-muted p-4">
          <h2 className="font-heading text-lg">{dict.dash.restore}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{dict.dash.restoreHint}</p>
          <Button type="submit" variant="outline" className="mt-3 h-10">{dict.dash.restore}</Button>
        </form>
      ) : null}
    </div>
  );
}
