import Link from "next/link";
import { generateQuestionsAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai";
import { listOrganizations } from "@/lib/domain";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ error?: string; made?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const query = await searchParams;
  const enabled = aiConfigured();
  const organizations = user.role === "super_admin" ? await listOrganizations() : [];
  const error = query.error === "ai_disabled" ? dict.ai.disabled : query.error === "ai_failed" ? dict.errors.generic : query.error ? dict.errors[query.error as keyof typeof dict.errors] || dict.errors.generic : "";
  return (
    <div>
      <PageHeader title={dict.ai.title} lede={dict.ai.lead} actions={<Button variant="outline" className="h-10" render={<Link href="/questions" />}>{dict.nav.questions}</Button>} />
      {!enabled ? <Notice text={dict.ai.disabled} /> : null}
      <Notice error text={error} />
      {query.made ? <p className="mb-4 text-sm" role="status">{fill(dict.ai.made, { n: query.made })}</p> : null}
      <form action={generateQuestionsAction} className="grid max-w-2xl gap-4">
        {user.role === "super_admin" ? (
          <Field label={dict.nav.organizations}>
            <NativeSelect name="organizationId" required>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </NativeSelect>
          </Field>
        ) : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <Field label={dict.ai.topic}><input name="topic" required disabled={!enabled} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-60" /></Field>
        <Field label={dict.common.subject}><input name="subject" disabled={!enabled} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-60" /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={dict.ai.level}>
            <NativeSelect name="difficulty" disabled={!enabled}>
              {Object.entries(dict.difficulty).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </Field>
          <Field label={dict.common.type}>
            <NativeSelect name="type" disabled={!enabled}>
              {Object.entries(dict.qtype).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </Field>
          <Field label={dict.ai.count}><input name="count" type="number" min={1} max={12} defaultValue={5} disabled={!enabled} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-60" /></Field>
        </div>
        <Field label={dict.ai.source}><textarea name="source" rows={6} disabled={!enabled} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:opacity-60" /></Field>
        <Field label={dict.ai.pdf}><input name="pdf" type="file" accept="application/pdf" disabled={!enabled} className="text-sm disabled:opacity-60" /></Field>
        <Button type="submit" className="h-11 w-fit" disabled={!enabled}>{dict.ai.generate}</Button>
      </form>
    </div>
  );
}
