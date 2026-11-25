import Link from "next/link";
import { acceptPaperAction, assignAction, deleteExamAction, proposePaperAction, releaseNowAction, resetSessionAction, unassignAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { SendExamLogins } from "@/components/credentials";
import { ExamEditor } from "@/components/exam-editor";
import { Button } from "@/components/ui/button";
import { NativeSelect, Notice, PageHeader, Pill } from "@/components/ui-app";
import { latestSuggestion } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { assignedCandidates, attemptCount, examQuestionLinks, getExam, listAssignments, listAttemptSummaries, listCategories, listDepartments, listGroups, listOrganizations, listQuestions, listUsers, managesOrg } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function ExamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const exam = await getExam(id);
  if (!exam || !managesOrg(user, exam.organizationId)) return <p>{(await getDictionary()).dict.errors.forbidden}</p>;
  const { dict, locale } = await getDictionary();
  const query = await searchParams;
  const [organizations, categories, departments, questions, links, assignments, attempts, groups, users, taken] = await Promise.all([
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
  ]);
  const assignedCount = (await assignedCandidates(id)).filter((person) => managesOrg(user, person.organizationId)).length;
  const candidates = users.filter((person) => person.role === "candidate");
  const published = questions.filter((question) => question.status === "published" && question.organizationId === exam.organizationId);
  const paper = await latestSuggestion("paper", exam.id);
  const topics = [...new Set(published.map((question) => question.topic))].slice(0, 6);
  const proposed = Array.isArray(paper?.payload.items) ? paper.payload.items as { id?: string; stem?: string; topic?: string; difficulty?: string }[] : [];
  return (
    <div className="grid gap-8">
      <PageHeader title={exam.title} lede={exam.organizationName} actions={<>
        <Button variant="outline" className="h-10" render={<Link href={`/exams/${exam.id}/monitor`} />}>{dict.monitor.title}</Button>
        <Button variant="outline" className="h-10" render={<Link href={`/reports/exams/${exam.id}`} />}>{dict.nav.reports}</Button>
        {exam.status === "draft" ? <form action={deleteExamAction}><input type="hidden" name="id" value={exam.id} /><Button type="submit" variant="outline" className="h-10">{dict.common.delete}</Button></form> : null}
      </>} />
      <Notice error text={query.error ? dict.errors[query.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <p className="text-sm" role="status">{exam.resultRelease === "instant" ? dict.release.seeNow : fill(dict.release.seeOn, { date: formatAddis(exam.resultReleaseAt, locale), zone: dict.zone })}</p>
      {exam.resultRelease === "scheduled" && exam.resultReleaseAt && new Date(exam.resultReleaseAt).getTime() > Date.now() ? (
        <form action={releaseNowAction} className="max-w-xl rounded-xl bg-[#f8efd4] p-4">
          <input type="hidden" name="id" value={exam.id} />
          <p className="text-sm">{dict.release.releaseNowHelp}</p>
          <Button type="submit" className="mt-3 h-10">{dict.release.releaseNow}</Button>
        </form>
      ) : null}
      {exam.resultRelease === "scheduled" && exam.resultReleaseAt && new Date(exam.resultReleaseAt).getTime() <= Date.now() ? <Pill tone="good">{dict.release.released}</Pill> : null}
      <section className="grid max-w-3xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-xl">{dict.assist.paper}</h2>
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
              <form action={acceptPaperAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="suggestionId" value={paper.id} /><Button type="submit" className="h-10">{dict.assist.usePaper}</Button></form>
            )}
          </div>
        ) : null}
      </section>
      <ExamEditor dict={dict} exam={exam} organizations={organizations} categories={categories} departments={departments} bank={published.map((question) => ({ id: question.id, stem: question.stem, type: question.type, subject: question.subject, difficulty: question.difficulty, points: question.points, organizationId: question.organizationId }))} selectedIds={links.map((question) => question.id)} locked={taken > 0} fixedOrg={user.role === "exam_manager" ? user.organizationId || undefined : undefined} />
      <section>
        <h2 className="font-heading text-xl">{dict.exams.assign}</h2>
        <form action={assignAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="examId" value={exam.id} />
          <NativeSelect name="assigneeType" className="max-w-40"><option value="group">{dict.exams.group}</option><option value="user">{dict.exams.candidate}</option></NativeSelect>
          <NativeSelect name="assigneeId" className="max-w-xs">
            <optgroup label={dict.exams.group}>{groups.filter((group) => group.organizationId === exam.organizationId || user.role === "super_admin").map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</optgroup>
            <optgroup label={dict.exams.candidate}>{candidates.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</optgroup>
          </NativeSelect>
          <Button type="submit" className="h-11">{dict.exams.assign}</Button>
        </form>
        <ul className="mt-3 grid gap-2">
          {assignments.map((row) => (
            <li key={String(row.id)} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10">
              <span>{String(row.label)} · {String(row.assignee_type)}</span>
              <form action={unassignAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="id" value={String(row.id)} /><Button type="submit" variant="ghost" size="sm">{dict.common.delete}</Button></form>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm"><Link href={`/users/import?examId=${exam.id}`} className="font-medium text-primary underline-offset-4 hover:underline">{dict.creds.importLink}</Link></p>
      </section>
      <section>
        <h2 className="font-heading text-xl">{dict.creds.sendAll}</h2>
        <div className="mt-3"><SendExamLogins dict={dict} examId={exam.id} assignedCount={assignedCount} /></div>
      </section>
      <section>
        <h2 className="font-heading text-xl">{dict.exams.attempts}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">{dict.common.name}</th><th>{dict.common.points}</th><th>{dict.status.submitted}</th><th>{dict.reports.switches}</th><th></th></tr></thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id} className="border-b">
                  <td className="py-2">{attempt.candidateName}</td>
                  <td>{attempt.status === "submitted" ? `${attempt.score ?? "—"}/${attempt.maxScore ?? "—"} (${attempt.percentage ?? "—"}%)` : dict.status.in_progress}</td>
                  <td>{attempt.gradingStatus === "pending_manual" ? dict.status.pending : attempt.passed == null ? "—" : attempt.passed ? dict.status.passed : dict.status.failed}</td>
                  <td>{attempt.tabSwitchCount}</td>
                  <td className="flex gap-2 py-2">
                    {attempt.status === "submitted" ? <Link href={`/grade/${attempt.id}`} className="text-primary underline-offset-4 hover:underline">{attempt.gradingStatus === "pending_manual" ? dict.exams.grade : dict.assist.written}</Link> : null}
                    {attempt.status === "in_progress" ? <form action={resetSessionAction}><input type="hidden" name="examId" value={exam.id} /><input type="hidden" name="id" value={attempt.id} /><button className="text-primary underline-offset-4 hover:underline" type="submit">{dict.exams.resetSession}</button></form> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
