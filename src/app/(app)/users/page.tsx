import Link from "next/link";
import { saveUserAction } from "@/app/actions/staff";
import { adminSetPasswordAction } from "@/app/actions/world";
import { ResetLoginButton } from "@/components/credentials";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, NativeSelect, Notice, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listOrganizations, listUsers } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const [users, organizations] = await Promise.all([listUsers(user), user.role === "super_admin" ? listOrganizations() : Promise.resolve([])]);
  return (
    <div>
      <PageHeader title={dict.ux.nav.students} lede={dict.ux.users.lead} actions={<><Button className="h-11 px-5" render={<Link href="/users/import" />}>{dict.ux.guide.s3Btn}</Button><Button variant="outline" className="h-11" render={<Link href="/groups" />}>{dict.ux.users.groupsLink}</Button></>} />
      {params.notice === "password_set" ? <><Flash text={dict.world.admin.passwordSet} /><Notice text={dict.world.admin.passwordSet} /></> : null}
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <details className="mb-6 max-w-xl rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary">{dict.ux.users.addOne}</summary>
      <form action={saveUserAction} className="mt-3 grid gap-3">
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
        <Button type="submit" variant="outline" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
      </details>
      {users.filter((person) => person.role === "candidate").length === 0 ? <div className="mb-6"><EmptyState title={dict.ux.empty.users} help={dict.ux.empty.usersHelp} action={<Button className="h-11" render={<Link href="/users/import" />}>{dict.ux.guide.s3Btn}</Button>} /></div> : null}
      <ul className="grid gap-2">
        {users.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <span>{person.fullName}<span className="block text-sm text-muted-foreground">{person.email} {person.phone ? `· ${person.phone}` : ""} {person.candidateNumber ? `· ${person.candidateNumber}` : ""}</span></span>
            <span className="flex flex-wrap items-start justify-end gap-2"><Pill>{dict.ux.roles[person.role]}</Pill><Pill tone={person.active ? "good" : "wait"}>{person.active ? dict.status.active : dict.status.inactive}</Pill>{person.role === "candidate" && person.organizationId ? <ResetLoginButton dict={dict} userId={person.id} email={person.email} /> : null}
              {user.role === "super_admin" ? (
                <details className="w-full sm:w-auto">
                  <summary className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline">{dict.world.admin.setPassword}</summary>
                  <form action={adminSetPasswordAction} className="mt-2 grid gap-2 rounded-lg bg-muted p-3">
                    <input type="hidden" name="userId" value={person.id} />
                    <label className="grid gap-1 text-sm">{dict.creds.newPassword}<Input name="password" type="password" minLength={8} required autoComplete="new-password" className="h-10" /></label>
                    {person.id !== user.id ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mustChange" defaultChecked /> {dict.world.admin.mustChange}</label> : null}
                    <Button type="submit" variant="outline" className="h-10 w-fit">{dict.creds.save}</Button>
                  </form>
                </details>
              ) : null}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
