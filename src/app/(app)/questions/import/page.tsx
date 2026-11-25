import Link from "next/link";
import { importQuestionsAction } from "@/app/actions/staff";
import { Flash } from "@/components/flash";
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
  const t = dict.ux.qimport;
  const params = await searchParams;
  const organizations = user.role === "super_admin" ? await listOrganizations() : [];
  const imported = Number(params.imported || 0);
  const skipped = Number(params.skipped || 0);
  const done = params.imported != null;
  return (
    <div className="max-w-2xl">
      <PageHeader title={dict.ux.guide.s1Btn} lede={dict.ux.guide.s1Help} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      {done ? (
        <section className="mb-6 grid gap-3 rounded-2xl bg-[#e5f6ee] p-4 text-[#0c5c40]" role="status">
          <Flash text={fill(t.done, { n: imported })} />
          <p className="font-heading text-xl">{fill(t.done, { n: imported })}</p>
          {skipped > 0 ? <p className="text-sm text-[#6b5420]">{fill(t.skipped, { n: skipped })}</p> : null}
          {imported > 0 ? <Button className="h-11 w-fit px-5" render={<Link href="/exams/new" />}>{t.makeExam}</Button> : null}
        </section>
      ) : null}
      <ol className="mb-5 grid gap-2 text-sm">
        <li><span className="font-semibold">1.</span> <Link href="/samples/question-import.csv" className="font-medium text-primary underline underline-offset-4">{t.template}</Link> · {t.help}</li>
        <li><span className="font-semibold">2.</span> {t.upload}</li>
      </ol>
      <form action={importQuestionsAction} className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {user.role === "super_admin" ? (
          <Field label={dict.auth.organization}>
            <NativeSelect name="organizationId">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect>
          </Field>
        ) : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <Field label={t.file} hint={dict.questions.importLead}><Input name="file" type="file" accept=".csv,.xlsx,text/csv" required className="h-11" /></Field>
        <Button type="submit" variant={done ? "outline" : "default"} className="h-11 w-fit px-5">{t.upload}</Button>
      </form>
    </div>
  );
}
