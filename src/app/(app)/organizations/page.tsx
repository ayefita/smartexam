import { saveOrgAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(["super_admin"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const organizations = await listOrganizations();
  return (
    <div>
      <PageHeader title={dict.nav.organizations} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <form action={saveOrgAction} className="mb-6 grid max-w-xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <Field label={dict.common.name}><Input name="name" required className="h-11" /></Field>
        <Field label={dict.common.code}><Input name="code" required className="h-11" /></Field>
        <Field label={dict.common.city}><Input name="city" className="h-11" defaultValue="Addis Ababa" /></Field>
        <Field label={dict.common.type}><NativeSelect name="type"><option value="university">{dict.orgType.university}</option><option value="school">{dict.orgType.school}</option><option value="employer">{dict.orgType.employer}</option></NativeSelect></Field>
        <Button type="submit" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
      <ul className="grid gap-2">{organizations.map((org) => <li key={org.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">{org.name} · {org.code} · {dict.orgType[org.type]} · {org.city}</li>)}</ul>
    </div>
  );
}
