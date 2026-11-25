import { ExamEditor } from "@/components/exam-editor";
import { Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listCategories, listDepartments, listOrganizations, listQuestions } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const [organizations, categories, departments, questions] = await Promise.all([
    user.role === "super_admin" ? listOrganizations() : Promise.resolve([]),
    listCategories(),
    listDepartments(user),
    listQuestions(user),
  ]);
  return (
    <div>
      <PageHeader title={dict.exams.new} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <ExamEditor
        dict={dict}
        organizations={organizations}
        categories={categories}
        departments={departments}
        bank={questions.filter((question) => question.status === "published").map((question) => ({ id: question.id, stem: question.stem, type: question.type, subject: question.subject, difficulty: question.difficulty, points: question.points, organizationId: question.organizationId }))}
        selectedIds={[]}
        locked={false}
        fixedOrg={user.role === "exam_manager" ? user.organizationId || undefined : undefined}
      />
    </div>
  );
}
