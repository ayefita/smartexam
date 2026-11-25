import Link from "next/link";
import { restoreAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { SetupGuide, type GuideStep } from "@/components/setup-guide";
import { EmptyState, Notice, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { demoRestoreAllowed, listExams, listMyExams, setupProgress, topicStrength } from "@/lib/domain";
import { formatAddis, formatBoth } from "@/lib/format";
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
    const st = dict.ux.student;
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={`${dict.dash.hello}, ${user.fullName}`} />
        <Notice error text={error} />
        <h2 className="mb-3 font-heading text-2xl">{st.myExams}</h2>
        {exams.length === 0 ? <EmptyState title={st.noExams} /> : (
          <div className="grid gap-3">
            {exams.map((card) => {
              const state = card.attemptStatus === "submitted" ? candidateResultState(card.exam, { status: "submitted", gradingStatus: card.gradingStatus === "finalized" ? "finalized" : "pending_manual" }) : null;
              const kind = card.attemptStatus === "submitted" ? "submitted" : card.attemptStatus === "in_progress" ? "progress" : card.window;
              const pill =
                kind === "submitted" ? <Pill tone="good">{st.submitted}</Pill>
                : kind === "progress" ? <Pill tone="wait">{st.inProgress}</Pill>
                : kind === "open" ? <Pill tone="good">{st.open}</Pill>
                : kind === "upcoming" ? <Pill tone="wait">{st.notOpen}</Pill>
                : <Pill>{st.closed}</Pill>;
              return (
                <article key={card.exam.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">{pill}</div>
                      <h3 className="mt-2 font-heading text-xl">{card.exam.title}</h3>
                      <p className="text-sm text-muted-foreground">{fill(st.minutes, { n: card.exam.durationMinutes })} · {card.exam.organizationName}</p>
                      {kind === "upcoming" && card.exam.startAt ? (
                        <p className="mt-2 text-sm font-medium" role="status"><Countdown dict={dict} to={card.exam.startAt} /> <span className="font-normal text-muted-foreground">· {fill(st.opensAt, { date: formatBoth(card.exam.startAt, locale) })}</span></p>
                      ) : null}
                      {kind === "open" && card.exam.endAt ? <p className="mt-2 text-sm">{fill(st.closesAt, { date: formatBoth(card.exam.endAt, locale) })}</p> : null}
                      {kind === "submitted" && card.showScore ? <p className="mt-2 text-lg font-semibold">{card.percentage}% · {card.passed ? dict.status.passed : dict.status.failed}</p> : null}
                      {kind === "submitted" && !card.showScore ? (
                        <p className="mt-2 text-sm" role="status">{state === "pending_release" || state === "pending_both" ? fill(st.resultOn, { date: formatAddis(card.exam.resultReleaseAt, locale) }) : st.waiting}</p>
                      ) : null}
                    </div>
                    {kind === "open" ? <Button className="h-12 px-6 text-base" render={<Link href={`/take/${card.exam.id}`} />}>{st.start}</Button> : null}
                    {kind === "progress" ? <Button className="h-12 px-6 text-base" render={<Link href={`/attempt/${card.attemptId}`} />}>{st.resume}</Button> : null}
                    {kind === "submitted" ? <Button variant="outline" className="h-11" render={<Link href={`/results/${card.attemptId}`} />}>{st.see}</Button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {topics && topics.topics.length > 0 ? (
          <>
            <h2 className="mt-8 mb-3 font-heading text-xl">{dict.dash.topicTitle}</h2>
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
          </>
        ) : null}
      </div>
    );
  }
  const [progress, exams] = await Promise.all([setupProgress(user), listExams(user)]);
  const g = dict.ux.guide;
  const focus = progress.focusExamId;
  const steps: GuideStep[] = [
    { title: g.s1, help: g.s1Help, button: g.s1Btn, href: "/questions/import", done: progress.questions > 0, count: progress.questions },
    { title: g.s2, help: g.s2Help, button: g.s2Btn, href: "/exams/new", done: progress.exams > 0, count: progress.exams },
    { title: g.s3, help: g.s3Help, button: g.s3Btn, href: focus ? `/users/import?examId=${focus}` : "/users/import", done: progress.assigned > 0 },
    { title: g.s4, help: g.s4Help, button: g.s4Btn, href: focus ? `/exams/${focus}#logins` : "/exams", done: progress.logins > 0 },
    { title: g.s5, help: g.s5Help, button: g.s5Btn, href: focus ? `/exams/${focus}` : "/exams", done: progress.published > 0 },
  ];
  return (
    <div className="grid gap-8">
      <div>
        <PageHeader title={`${dict.dash.hello}, ${user.fullName}`} />
        <Notice error text={error} />
      </div>
      <SetupGuide dict={dict} steps={steps} />
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-heading text-xl">{dict.ux.nav.exams}</h2>
          {exams.length ? <Link href="/exams" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{dict.common.all}</Link> : null}
        </div>
        {exams.length === 0 ? <EmptyState title={dict.ux.empty.exams} help={dict.ux.empty.examsHelp} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {exams.slice(0, 6).map((exam) => (
              <Link key={exam.id} href={`/exams/${exam.id}`} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-primary">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg">{exam.title}</h3>
                  <Pill tone={exam.status === "published" ? "good" : exam.status === "draft" ? "wait" : "neutral"}>{dict.status[exam.status]}</Pill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{exam.organizationName} · {fill(dict.ux.hub.duration, { n: exam.durationMinutes })}{exam.startAt ? ` · ${formatAddis(exam.startAt, locale)}` : ""}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
      {user.role === "super_admin" && demoRestoreAllowed() ? (
        <details className="max-w-xl rounded-2xl bg-muted p-4">
          <summary className="cursor-pointer font-medium">{dict.ux.editor.advanced}</summary>
          <form action={restoreAction} className="mt-3">
            <h2 className="font-heading text-lg">{dict.dash.restore}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{dict.dash.restoreHint}</p>
            <Button type="submit" variant="outline" className="mt-3 h-10">{dict.dash.restore}</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
