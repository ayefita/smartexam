import { EmptyState, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function NotificationsPage() {
  const user = await requireUser();
  const { dict, locale } = await getDictionary();
  const rows = await listNotifications(user);
  const smtp = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
  return (
    <div>
      <PageHeader title={dict.nav.notifications} lede={smtp ? "" : dict.auth.verifyDev} />
      {rows.length === 0 ? <EmptyState title={dict.ux.empty.messages} /> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-2"><strong>{row.subject}</strong><Pill>{row.status}</Pill></div>
            <p className="text-xs text-muted-foreground">{row.name} · {row.email} · {formatAddis(row.createdAt, locale)}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{row.body}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
