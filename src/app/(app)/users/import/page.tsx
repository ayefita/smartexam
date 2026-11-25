import Link from "next/link";
import { CandidateImport } from "@/components/credentials";
import { PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { IMPORT_MAX_ROWS } from "@/lib/credentials";
import { listExams, listGroups, listOrganizations } from "@/lib/domain";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function ImportCandidatesPage({ searchParams }: { searchParams: Promise<{ examId?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const [organizations, groups, exams] = await Promise.all([
    user.role === "super_admin" ? listOrganizations() : Promise.resolve([]),
    listGroups(user),
    listExams(user),
  ]);
  const exam = params.examId ? exams.find((item) => item.id === params.examId) : undefined;
  const defaultOrganizationId = exam?.organizationId || user.organizationId || organizations[0]?.id || "";
  return (
    <div>
      <PageHeader title={dict.creds.importTitle} />
      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{fill(dict.creds.importLead, { max: IMPORT_MAX_ROWS })}</p>
      <p className="mb-4 flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/samples/candidate-import.csv" download className="text-primary underline-offset-4 hover:underline">{dict.creds.templateCsv}</Link>
        <a href="/api/credentials/template" className="text-primary underline-offset-4 hover:underline">{dict.creds.templateXlsx}</a>
      </p>
      <CandidateImport
        dict={dict}
        organizations={organizations.map((org) => ({ id: org.id, name: org.name }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name, organizationId: group.organizationId }))}
        exams={exams.filter((item) => item.status !== "closed").map((item) => ({ id: item.id, name: item.title, organizationId: item.organizationId }))}
        defaultOrganizationId={defaultOrganizationId}
        defaultExamId={exam?.id || ""}
        showOrganization={user.role === "super_admin"}
      />
    </div>
  );
}
