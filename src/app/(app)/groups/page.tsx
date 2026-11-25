import Link from "next/link";
import { saveGroupAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Field, NativeSelect, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listDepartments, listGroups, listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function GroupsPage() {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const [groups, organizations, departments] = await Promise.all([listGroups(user), user.role === "super_admin" ? listOrganizations() : Promise.resolve([]), listDepartments(user)]);
  return (
    <div>
      <PageHeader title={dict.nav.groups} lede={dict.ux.empty.groupsHelp} />
      <form action={saveGroupAction} className="mb-6 grid max-w-xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {user.role === "super_admin" ? <Field label={dict.auth.organization}><NativeSelect name="organizationId">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect></Field> : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <Field label={dict.common.name}><Input name="name" required className="h-11" /></Field>
        <Field label={dict.nav.departments}><NativeSelect name="departmentId"><option value="">{dict.common.all}</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</NativeSelect></Field>
        <Button type="submit" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
      {groups.length === 0 ? <EmptyState title={dict.ux.empty.groups} help={dict.ux.empty.groupsHelp} /> : <ul className="grid gap-2">{groups.map((group) => <li key={group.id}><Link href={`/groups/${group.id}`} className="block rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">{group.name} · {group.memberCount} {dict.ux.nav.students.toLowerCase()}</Link></li>)}</ul>}
    </div>
  );
}
