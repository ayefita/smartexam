import Link from "next/link";
import { importQuestionsAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listOrganizations } from "@/lib/domain";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ error?: string; imported?: string; skipped?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const organizations = user.role === "super_admin" ? await listOrganizations() : [];
  return (
    <div>
      <PageHeader title={dict.questions.import} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      {params.imported ? <Notice text={fill(dict.questions.imported, { n: params.imported, s: params.skipped || "0" })} /> : null}
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{dict.questions.importLead}</p>
      <p className="mb-4"><Link href="/samples/question-import.csv" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{dict.questions.template}</Link></p>
      <form action={importQuestionsAction} className="grid max-w-xl gap-4">
        {user.role === "super_admin" ? (
          <Field label={dict.auth.organization}>
            <NativeSelect name="organizationId">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect>
          </Field>
        ) : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <Field label={dict.questions.import}><Input name="file" type="file" accept=".csv,.xlsx,text/csv" required className="h-11" /></Field>
        <Button type="submit" className="h-11 w-fit">{dict.questions.import}</Button>
      </form>
    </div>
  );
}
