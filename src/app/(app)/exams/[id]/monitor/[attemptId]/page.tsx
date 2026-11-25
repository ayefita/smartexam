import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { attemptTimeline } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

export const dynamic = "force-dynamic";

const SERIOUS = new Set(["tab_switch", "fullscreen_exit", "paste", "copy_blocked", "session_takeover", "auto_submit", "camera_denied", "disconnect"]);

export default async function TimelinePage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id, attemptId } = await params;
  const { dict, locale } = await getDictionary();
  const timeline = await attemptTimeline(user, attemptId);
  if (!timeline || timeline.examId !== id) return <p>{dict.errors.not_found}</p>;
  const w = dict.world.timeline;
  const kinds = w.kinds as Record<string, string>;
  const rows = [
    timeline.startedAt ? { id: "start", kind: "started", detail: "", snapshot: "", createdAt: timeline.startedAt } : null,
    ...timeline.events,
    timeline.submittedAt ? { id: "end", kind: "submitted", detail: timeline.submitReason, snapshot: "", createdAt: timeline.submittedAt } : null,
  ].filter((row): row is NonNullable<typeof row> => !!row);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={timeline.name}
        lede={`${w.title} · ${timeline.examTitle}`}
        actions={<Button variant="outline" className="h-10" render={<Link href={`/exams/${id}/monitor`} />}>{dict.monitor.title}</Button>}
      />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Pill tone="neutral">{fill(w.tabs, { n: timeline.tabSwitches })}</Pill>
        <Pill tone={timeline.risk >= 55 ? "bad" : timeline.risk >= 25 ? "wait" : "good"}>{dict.monitor.risk}: {timeline.risk}</Pill>
        {timeline.extraMinutes ? <Pill tone="neutral">{fill(dict.world.board.extraBadge, { n: timeline.extraMinutes })}</Pill> : null}
      </div>
      {rows.length ? (
        <ol className="relative grid gap-3 border-l-2 border-border pl-5">
          {rows.map((event) => (
            <li key={event.id} className="relative rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10">
              <span className={`absolute -left-[27px] top-4 size-3 rounded-full ${SERIOUS.has(event.kind) ? "bg-[#c2410c]" : "bg-primary"}`} aria-hidden />
              <p className="font-medium">{kinds[event.kind] || event.kind}</p>
              <p className="text-xs text-muted-foreground">{formatAddis(event.createdAt, locale)} ({dict.zone})</p>
              {event.detail ? <p className="mt-1 text-muted-foreground">{event.detail}</p> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {event.snapshot ? <img src={event.snapshot} alt={w.snapshot} className="mt-2 h-24 rounded-md" /> : null}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">{w.empty}</p>}
    </div>
  );
}
