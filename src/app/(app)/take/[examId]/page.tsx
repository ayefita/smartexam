import { startExamAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { getExam, isAssigned } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";
import { examWindow } from "@/lib/results";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

export default async function TakePage({ params, searchParams }: { params: Promise<{ examId: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["candidate"]);
  const { examId } = await params;
  const exam = await getExam(examId);
  const { dict, locale } = await getDictionary();
  const queryParams = await searchParams;
  if (!exam || !(await isAssigned(examId, user.id))) return <p>{dict.errors.not_assigned}</p>;
  const existing = await query(`select id, status from attempts where exam_id = $1 and candidate_id = $2`, [examId, user.id]);
  if (existing[0]?.status === "submitted") redirect(`/results/${existing[0].id}`);
  if (existing[0]?.status === "in_progress") redirect(`/attempt/${existing[0].id}`);
  const window = examWindow(exam);
  const count = exam.selectionMode === "random_each" ? exam.randomCount : exam.randomCount || undefined;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={exam.title} lede={exam.organizationName} />
      <Notice error text={queryParams.error === "consent" ? dict.player.consent : queryParams.error ? dict.errors[queryParams.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <div className="grid gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 text-sm">
        <p className="whitespace-pre-wrap">{exam.instructions}</p>
        <p>{exam.durationMinutes} {dict.common.minutes}{count ? ` · ${count} ${dict.player.navigator.toLowerCase()}` : ""}</p>
        <p>{dict.exams.pass}: {exam.passMark}%</p>
        <p>{exam.resultRelease === "instant" ? dict.release.instantHelp : fill(dict.release.seeOn, { date: formatAddis(exam.resultReleaseAt, locale), zone: dict.zone })}</p>
        <p>{exam.startAt ? formatAddis(exam.startAt, locale) : ""} — {exam.endAt ? formatAddis(exam.endAt, locale) : ""}</p>
        {exam.proctorWebcam ? <p>{dict.exams.webcam}</p> : null}
        {exam.proctorFullscreen ? <p>{dict.exams.fullscreen}</p> : null}
        <p>{dict.player.keys}</p>
      </div>
      {window === "open" ? (
        <form action={startExamAction} className="mt-4 grid gap-3">
          <input type="hidden" name="examId" value={exam.id} />
          {exam.proctorWebcam ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" required /> {dict.player.consent}</label> : null}
          <Button type="submit" className="h-11 w-fit">{dict.exams.take}</Button>
        </form>
      ) : <p className="mt-4 text-sm" role="status">{dict.errors.window}</p>}
    </div>
  );
}
