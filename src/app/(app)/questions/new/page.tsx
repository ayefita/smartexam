import { QuestionForm } from "@/components/question-form";
import { Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const organizations = user.role === "super_admin" ? await listOrganizations() : [];
  return (
    <div>
      <PageHeader title={dict.questions.new} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <QuestionForm dict={dict} organizations={organizations} fixedOrg={user.role === "exam_manager" ? user.organizationId || undefined : undefined} />
    </div>
  );
}
