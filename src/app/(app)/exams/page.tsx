import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listExams } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function ExamsPage() {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict, locale } = await getDictionary();
  const exams = await listExams(user);
  return (
    <div>
      <PageHeader title={dict.exams.title} actions={<Button className="h-10" render={<Link href="/exams/new" />}>{dict.exams.new}</Button>} />
      <div className="grid gap-3">
        {exams.length === 0 ? <EmptyState title={dict.ux.empty.exams} help={dict.ux.empty.examsHelp} action={<Button className="h-11" render={<Link href="/exams/new" />}>{dict.exams.new}</Button>} /> : exams.map((exam) => (
          <Link key={exam.id} href={`/exams/${exam.id}`} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl">{exam.title}</h2>
              <Pill tone={exam.status === "published" ? "good" : exam.status === "draft" ? "wait" : "neutral"}>{dict.status[exam.status]}</Pill>
              <Pill tone={exam.resultRelease === "instant" ? "good" : "wait"}>{exam.resultRelease === "instant" ? dict.release.instant : `${dict.release.scheduled}${exam.resultReleaseAt ? ` · ${formatAddis(exam.resultReleaseAt, locale)}` : ""}`}</Pill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{exam.organizationName} · {exam.durationMinutes} {dict.common.minutes}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
