import { deleteDepartmentAction, saveDepartmentAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Notice, PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listDepartments, listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  const [departments, organizations] = await Promise.all([listDepartments(user), user.role === "super_admin" ? listOrganizations() : Promise.resolve([])]);
  return (
    <div>
      <PageHeader title={dict.nav.departments} />
      <Notice error text={params.error ? dict.errors[params.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <form action={saveDepartmentAction} className="mb-6 grid max-w-xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {user.role === "super_admin" ? <Field label={dict.auth.organization}><NativeSelect name="organizationId">{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect></Field> : <input type="hidden" name="organizationId" value={user.organizationId || ""} />}
        <Field label={dict.common.name}><Input name="name" required className="h-11" /></Field>
        <Field label={dict.common.type}><NativeSelect name="kind"><option value="department">{dict.nav.departments}</option><option value="position">Position</option></NativeSelect></Field>
        <Button type="submit" className="h-11 w-fit">{dict.common.create}</Button>
      </form>
      <ul className="grid gap-2">
        {departments.map((department) => (
          <li key={department.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <span>{department.name} · {department.organizationName} · {department.kind}</span>
            <form action={deleteDepartmentAction}><input type="hidden" name="id" value={department.id} /><Button type="submit" variant="ghost" size="sm">{dict.common.delete}</Button></form>
          </li>
        ))}
      </ul>
    </div>
  );
}
