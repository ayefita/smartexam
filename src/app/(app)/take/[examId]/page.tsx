import { CheckCircle2Icon } from "lucide-react";
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
  const links = await query(`select count(*) as n from exam_questions where exam_id = $1`, [examId]);
  const total = exam.selectionMode === "random_each" ? exam.randomCount : Number(links[0]?.n || 0);
  const b = dict.ux.before;
  const items = [
    fill(b.duration, { n: exam.durationMinutes }),
    total ? fill(b.questions, { n: total }) : "",
    exam.startAt || exam.endAt ? fill(b.time, { start: formatAddis(exam.startAt, locale), end: `${formatAddis(exam.endAt, locale)} (${dict.zone})` }) : "",
    fill(b.pass, { n: exam.passMark }),
    b.autosave,
    b.auto,
    b.stay,
    exam.proctorFullscreen ? b.fullscreen : "",
    exam.proctorWebcam ? b.webcam : "",
  ].filter(Boolean);
  const error = queryParams.error === "consent" ? b.consent : queryParams.error ? dict.errors[queryParams.error as keyof typeof dict.errors] || dict.errors.generic : "";
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-medium text-primary">{b.title}</p>
      <PageHeader title={exam.title} lede={exam.organizationName} />
      <Notice error text={error} />
      <section className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 md:p-6">
        {exam.instructions ? <p className="whitespace-pre-wrap rounded-xl bg-muted p-4 text-base">{exam.instructions}</p> : null}
        <h2 className="font-heading text-lg">{b.read}</h2>
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-base">
              <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-[#0c5c40]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{exam.resultRelease === "instant" ? dict.release.instantHelp : fill(dict.release.seeOn, { date: formatAddis(exam.resultReleaseAt, locale), zone: dict.zone })}</p>
      </section>
      {window === "open" ? (
        <form action={startExamAction} className="mt-5 grid gap-4">
          <input type="hidden" name="examId" value={exam.id} />
          {exam.proctorWebcam ? <label className="flex items-start gap-3 text-base"><input type="checkbox" name="consent" required className="mt-1 size-5 accent-[#0c5c40]" /> {b.consent}</label> : null}
          <Button type="submit" className="h-14 w-full text-lg sm:w-fit sm:px-10">{b.start}</Button>
        </form>
      ) : <p className="mt-5 rounded-xl bg-[#f8efd4] p-4 text-base text-[#5c4718]" role="status">{b.notOpen}</p>}
    </div>
  );
}
