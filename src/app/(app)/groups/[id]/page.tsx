import { notFound } from "next/navigation";
import { saveGroupAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { getGroup, listUsers } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const found = await getGroup(user, id);
  if (!found) notFound();
  const { dict } = await getDictionary();
  const users = (await listUsers(user)).filter((person) => person.role === "candidate");
  return (
    <div>
      <PageHeader title={found.group.name} />
      <form action={saveGroupAction} className="grid max-w-xl gap-3">
        <input type="hidden" name="id" value={found.group.id} />
        <input type="hidden" name="organizationId" value={found.group.organizationId} />
        <Input name="name" defaultValue={found.group.name} className="h-11" />
        <div className="grid max-h-80 gap-1 overflow-auto rounded-xl border border-border p-3">
          {users.map((person) => (
            <label key={person.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="member" value={person.id} defaultChecked={found.memberIds.includes(person.id)} />
              {person.fullName}
            </label>
          ))}
        </div>
        <Button type="submit" className="h-11 w-fit">{dict.common.save}</Button>
      </form>
    </div>
  );
}
