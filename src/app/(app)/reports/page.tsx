import Link from "next/link";
import { EmptyState, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listExams } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function ReportsPage() {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const exams = await listExams(user);
  return (
    <div>
      <PageHeader title={dict.ux.nav.results} />
      {exams.length === 0 ? <EmptyState title={dict.ux.empty.results} help={dict.ux.empty.resultsHelp} /> : null}
      <div className="grid gap-2">
        {exams.map((exam) => (
          <Link key={exam.id} href={`/reports/exams/${exam.id}`} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <span>{exam.title}<span className="block text-sm text-muted-foreground">{exam.organizationName}</span></span>
            <Pill tone={exam.resultRelease === "instant" ? "good" : "wait"}>{exam.resultRelease === "instant" ? dict.release.instant : dict.release.scheduled}</Pill>
          </Link>
        ))}
      </div>
    </div>
  );
}
