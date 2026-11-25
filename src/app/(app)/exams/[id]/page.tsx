import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { acceptPaperAction, assignAction, deleteExamAction, proposePaperAction, releaseNowAction, resetSessionAction, setExamStatusAction, unassignAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { SendExamLogins } from "@/components/credentials";
import { ExamEditor } from "@/components/exam-editor";
import { PublishButton } from "@/components/exam-hub";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { EmptyState, NativeSelect, Notice, PageHeader, Pill } from "@/components/ui-app";
import { latestSuggestion } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { attemptCount, examProgress, examQuestionLinks, getExam, listAssignments, listAttemptSummaries, listCategories, listDepartments, listGroups, listOrganizations, listQuestions, listUsers, managesOrg } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; created?: string; status?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const exam = await getExam(id);
  if (!exam || !managesOrg(user, exam.organizationId)) return <p>{(await getDictionary()).dict.errors.forbidden}</p>;
  const { dict, locale } = await getDictionary();
  const hub = dict.ux.hub;
  const query = await searchParams;
  const [organizations, categories, departments, questions, links, assignments, attempts, groups, users, taken, progress] = await Promise.all([
    user.role === "super_admin" ? listOrganizations() : Promise.resolve([]),
    listCategories(),
    listDepartments(user),
    listQuestions(user),
    examQuestionLinks(id),
    listAssignments(id),
    listAttemptSummaries(id),
    listGroups(user),
    listUsers(user),
    attemptCount(id),
    examProgress(id),
  ]);
  const candidates = users.filter((person) => person.role === "candidate" && person.organizationId === exam.organizationId);
  const orgGroups = groups.filter((group) => group.organizationId === exam.organizationId);
  const published = questions.filter((question) => question.status === "published" && question.organizationId === exam.organizationId);
  const paper = await latestSuggestion("paper", exam.id);
  const topics = [...new Set(published.map((question) => question.topic))].slice(0, 6);
  const proposed = Array.isArray(paper?.payload.items) ? paper.payload.items as { id?: string; stem?: string; topic?: string; difficulty?: string }[] : [];

  const isLive = exam.status === "published";
  const steps = [
    { label: hub.step1, done: progress.questions > 0, detail: fill(hub.questions, { n: progress.questions, p: progress.points }) },
    { label: hub.step2, done: progress.students > 0, detail: fill(hub.studentsCount, { n: progress.students }) },
    { label: hub.step3, done: progress.loginsSent, detail: progress.loginsSent ? dict.ux.guide.done : dict.ux.guide.todo },
    { label: hub.step4, done: isLive, detail: dict.status[exam.status] },
  ];
  const next = !steps[0].done ? "questions" : !steps[1].done ? "students" : !steps[2].done ? "logins" : !isLive && exam.status !== "closed" ? "publish" : null;
  const nextLabel = next === "questions" ? hub.n1 : next === "students" ? hub.n2 : next === "logins" ? hub.n3 : next === "publish" ? hub.n4 : "";
  const flash = query.created ? fill(hub.created, { next: nextLabel || hub.n4 }) : query.saved ? fill(hub.saved, { next: nextLabel || hub.watch }) : query.status === "published" ? hub.published : query.status === "draft" ? hub.drafted : query.status === "closed" ? hub.closedMsg : "";
  const error = query.error ? dict.errors[query.error as keyof typeof dict.errors] || dict.errors.generic : "";
  const windowText = exam.startAt || exam.endAt ? `${formatAddis(exam.startAt, locale)} – ${formatAddis(exam.endAt, locale)} (${dict.zone})` : hub.anyTime;
  const publishButton = (primary: boolean) => (
    <PublishButton dict={dict} examId={exam.id} questions={progress.questions} students={progress.students} hasWindow={!!(exam.startAt || exam.endAt)} primary={primary} />
  );
  const sectionNav = [
    ["#settings", hub.settings],
    ["#students", hub.students],
    ["#logins", hub.logins],
    ["#results", hub.results],
  ];

  return (
    <div className="grid gap-8">
      <Flash text={flash} scrollTop />
      <PageHeader title={exam.title} lede={`${exam.organizationName} · ${fill(hub.duration, { n: exam.durationMinutes })}`} />
      <Notice error text={error} />

      <section aria-labelledby="progress-title" className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
        <h2 id="progress-title" className="sr-only">{hub.nextLabel}</h2>
        <ol className="grid gap-3 sm:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.label} className={`flex items-start gap-3 rounded-xl p-3 ${step.done ? "bg-[#e5f6ee]" : "bg-muted"}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${step.done ? "bg-[#0c5c40] text-white" : "bg-background text-foreground ring-1 ring-foreground/20"}`} aria-hidden>
                {step.done ? <CheckIcon className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{step.label}</span>
                <span className="block text-xs text-muted-foreground">{step.detail}</span>
                <span className="sr-only">{step.done ? dict.ux.guide.done : dict.ux.guide.todo}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          {next ? <p className="text-sm font-medium">{hub.nextLabel}:</p> : <p className="text-sm font-medium" role="status">{isLive ? hub.live : hub.closed}</p>}
          {next === "questions" ? <Button className="h-11 px-5 text-base" render={<Link href="#settings" />}>{hub.n1}</Button> : null}
          {next === "students" ? <Button className="h-11 px-5 text-base" render={<Link href={`/users/import?examId=${exam.id}`} />}>{hub.n2}</Button> : null}
          {next === "logins" ? <Button className="h-11 px-5 text-base" render={<Link href="#logins" />}>{hub.n3}</Button> : null}
          {next === "publish" ? publishButton(true) : null}
          {next && next !== "publish" && exam.status === "draft" && progress.questions > 0 ? publishButton(false) : null}
          {isLive ? <Button variant="outline" className="h-11" render={<Link href={`/exams/${exam.id}/monitor`} />}>{hub.watch}</Button> : null}
        </div>
        <p className="text-sm text-muted-foreground">{hub.time}: {windowText}</p>
        <nav aria-label={hub.settings} className="flex flex-wrap gap-2 border-t border-border pt-3 text-sm">
          {sectionNav.map(([href, label]) => <a key={href} href={href} className="rounded-full bg-muted px-3 py-1.5 hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-primary">{label}</a>)}
        </nav>
      </section>

      <section id="students" className="grid gap-3 scroll-mt-20">
        <h2 className="font-heading text-2xl">{hub.students}</h2>
        <p className="text-sm">{fill(hub.studentsCount, { n: progress.students })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" render={<Link href={`/users/import?examId=${exam.id}`} />}>{hub.import}</Button>
        </div>
        <form action={assignAction} className="flex flex-wrap items-end gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
          <input type="hidden" name="examId" value={exam.id} />
          <label className="grid gap-1 text-sm">
            <span>{hub.addOne}</span>
            <NativeSelect name="assigneeType" className="max-w-48" aria-label={dict.common.type}><option value="group">{dict.exams.group}</option><option value="user">{dict.ux.roles.candidate}</option></NativeSelect>
          </label>
          <NativeSelect name="assigneeId" className="max-w-xs" aria-label={hub.students}>
            <optgroup label={dict.exams.group}>{orgGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</optgroup>
            <optgroup label={dict.ux.roles.candidate}>{candidates.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</optgroup>
          </NativeSelect>
          <Button type="submit" variant="outline" className="h-11">{hub.add}</Button>
        </form>
        {assignments.length === 0 ? <p className="text-sm text-muted-foreground">{hub.noStudents}</p> : (
          <ul className="grid gap-2">
            {assignments.map((row) => (
              <li key={String(row.id)} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10">
                <span>{String(row.label)} <span className="text-muted-foreground">· {row.assignee_type === "group" ? dict.exams.group : dict.ux.roles.candidate}</span></span>
                <form action={unassignAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="id" value={String(row.id)} /><Button type="submit" variant="ghost" size="sm">{hub.remove}</Button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="logins" className="grid gap-3 scroll-mt-20">
        <h2 className="font-heading text-2xl">{hub.logins}</h2>
        <SendExamLogins dict={dict} examId={exam.id} assignedCount={progress.students} />
      </section>

      <section id="results" className="grid gap-3 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-2xl">{hub.results}</h2>
          <div className="flex gap-2">
            <Button variant="outline" className="h-10" render={<Link href={`/exams/${exam.id}/monitor`} />}>{hub.watch}</Button>
            <Button variant="outline" className="h-10" render={<Link href={`/reports/exams/${exam.id}`} />}>{hub.report}</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{exam.resultRelease === "instant" ? dict.release.seeNow : fill(dict.release.seeOn, { date: formatAddis(exam.resultReleaseAt, locale), zone: dict.zone })}</p>
        {attempts.length === 0 ? <EmptyState title={hub.noResults} /> : (
          <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="px-3 py-2">{dict.common.name}</th><th className="px-3">{dict.common.points}</th><th className="px-3">{dict.status.submitted}</th><th className="px-3">{dict.reports.switches}</th><th className="px-3"></th></tr></thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{attempt.candidateName}</td>
                    <td className="px-3">{attempt.status === "submitted" ? `${attempt.score ?? "—"}/${attempt.maxScore ?? "—"} (${attempt.percentage ?? "—"}%)` : dict.ux.student.inProgress}</td>
                    <td className="px-3">{attempt.gradingStatus === "pending_manual" ? dict.status.pending : attempt.passed == null ? "—" : attempt.passed ? dict.status.passed : dict.status.failed}</td>
                    <td className="px-3">{attempt.tabSwitchCount}</td>
                    <td className="flex gap-2 px-3 py-2">
                      {attempt.status === "submitted" ? <Link href={`/grade/${attempt.id}`} className="text-primary underline-offset-4 hover:underline">{attempt.gradingStatus === "pending_manual" ? dict.exams.grade : dict.assist.written}</Link> : null}
                      {attempt.status === "in_progress" ? <form action={resetSessionAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="id" value={attempt.id} /><button className="text-primary underline-offset-4 hover:underline" type="submit">{dict.exams.resetSession}</button></form> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="settings" className="grid gap-3 scroll-mt-20">
        <details open={progress.questions === 0 || !!query.error} className="group rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <summary className="cursor-pointer list-none font-heading text-2xl focus-visible:outline-2 focus-visible:outline-primary">
            {hub.settings} <span className="text-sm font-normal text-primary underline-offset-4 group-open:hidden">· {hub.edit}</span>
          </summary>
          <div className="mt-4">
            <ExamEditor dict={dict} exam={exam} organizations={organizations} categories={categories} departments={departments} bank={published.map((question) => ({ id: question.id, stem: question.stem, type: question.type, subject: question.subject, difficulty: question.difficulty, points: question.points, organizationId: question.organizationId }))} selectedIds={links.map((question) => question.id)} locked={taken > 0} fixedOrg={user.role === "exam_manager" ? user.organizationId || undefined : undefined} />
          </div>
        </details>
      </section>

      <details className="rounded-2xl bg-muted/60 p-4">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary">{dict.ux.editor.advanced}</summary>
        <p className="mt-1 text-sm text-muted-foreground">{dict.ux.editor.advancedHelp}</p>
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm">{hub.status}: <Pill>{dict.status[exam.status]}</Pill></span>
            {exam.status !== "draft" ? (
              <form action={setExamStatusAction}><input type="hidden" name="id" value={exam.id} /><input type="hidden" name="status" value="draft" /><Button type="submit" variant="outline" className="h-10">{hub.toDraft}</Button></form>
            ) : null}
            {exam.status === "published" ? (
              <form action={setExamStatusAction}><input type="hidden" name="id" value={exam.id} /><input type="hidden" name="status" value="closed" /><Button type="submit" variant="outline" className="h-10">{hub.close}</Button></form>
            ) : null}
            {exam.status === "draft" ? <form action={deleteExamAction}><input type="hidden" name="id" value={exam.id} /><Button type="submit" variant="destructive" className="h-10">{hub.delete}</Button></form> : null}
          </div>
          {exam.resultRelease === "scheduled" && exam.resultReleaseAt && new Date(exam.resultReleaseAt).getTime() > Date.now() ? (
            <form action={releaseNowAction} className="max-w-xl rounded-xl bg-[#f8efd4] p-4">
              <input type="hidden" name="id" value={exam.id} />
              <p className="text-sm">{dict.release.releaseNowHelp}</p>
              <Button type="submit" variant="outline" className="mt-3 h-10">{dict.release.releaseNow}</Button>
            </form>
          ) : null}
          <div className="grid max-w-3xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <h3 className="font-heading text-lg">{dict.assist.paper}</h3>
            <p className="text-sm text-muted-foreground">{dict.assist.paperb}</p>
            <form action={proposePaperAction} className="grid gap-2">
              <input type="hidden" name="examId" value={exam.id} />
              {[0, 1, 2].map((row) => (
                <div key={row} className="grid gap-2 sm:grid-cols-[1fr_9rem_6rem]">
                  <input name="topic" defaultValue={topics[row] || ""} placeholder={dict.common.topic} aria-label={dict.common.topic} className="h-11 rounded-lg border border-input bg-card px-3 text-sm" />
                  <NativeSelect name="difficulty" defaultValue="" aria-label={dict.ai.level}>
                    <option value="">{dict.common.all}</option>
                    {Object.entries(dict.difficulty).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </NativeSelect>
                  <input name="count" type="number" min={0} max={20} defaultValue={row === 0 ? 3 : 0} aria-label={dict.ai.count} className="h-11 rounded-lg border border-input bg-card px-3 text-sm" />
                </div>
              ))}
              <Button type="submit" variant="outline" className="h-10 w-fit">{dict.assist.propose}</Button>
            </form>
            {paper && paper.status === "suggested" ? (
              <div className="grid gap-2 text-sm">
                <AssistNote source={paper.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
                <p>{String(paper.payload.notes || "")}</p>
                <ul className="grid gap-1">{proposed.map((item) => <li key={String(item.id)}>{item.topic} · {item.difficulty} · {item.stem}</li>)}</ul>
                {taken > 0 ? <p>{dict.assist.locked}</p> : (
                  <form action={acceptPaperAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="suggestionId" value={paper.id} /><Button type="submit" variant="outline" className="h-10">{dict.assist.usePaper}</Button></form>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
