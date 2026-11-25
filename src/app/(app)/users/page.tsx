import { saveUserAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Notice, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listOrganizations, listUsers } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const [users, organizations] = await Promise.all([listUsers(user), user.role === "super_admin" ? listOrganizations() : Promise.resolve([])]);
  return (
    <div>
      <PageHeader title={dict.nav.users} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <form action={saveUserAction} className="mb-6 grid max-w-xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <Field label={dict.auth.fullName}><Input name="fullName" required className="h-11" /></Field>
        <Field label={dict.common.email}><Input name="email" type="email" required className="h-11" /></Field>
        <Field label={dict.common.phone} hint={dict.errors.phone}><Input name="phone" className="h-11" /></Field>
        <Field label={dict.auth.password}><Input name="password" type="password" minLength={8} required className="h-11" /></Field>
        {user.role === "super_admin" ? (
          <>
            <Field label={dict.common.type}><NativeSelect name="role"><option value="candidate">{dict.roles.candidate}</option><option value="exam_manager">{dict.roles.exam_manager}</option><option value="super_admin">{dict.roles.super_admin}</option></NativeSelect></Field>
            <Field label={dict.auth.organization}><NativeSelect name="organizationId"><option value="">{dict.common.all}</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect></Field>
          </>
        ) : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> {dict.status.active}</label>
        <Button type="submit" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
      <ul className="grid gap-2">
        {users.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <span>{person.fullName}<span className="block text-sm text-muted-foreground">{person.email} {person.phone ? `· ${person.phone}` : ""}</span></span>
            <span className="flex gap-2"><Pill>{dict.roles[person.role]}</Pill><Pill tone={person.active ? "good" : "wait"}>{person.active ? dict.status.active : dict.status.inactive}</Pill></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
