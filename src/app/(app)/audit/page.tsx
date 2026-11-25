import { PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function AuditPage() {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict, locale } = await getDictionary();
  const rows = await listAudit(user);
  return (
    <div>
      <PageHeader title={dict.nav.audit} />
      <ul className="grid gap-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
            <p>{formatAddis(row.createdAt, locale)} · {row.actorName} · {row.action} {row.entity}</p>
            <p className="text-muted-foreground">{row.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
