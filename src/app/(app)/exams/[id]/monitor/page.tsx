import Link from "next/link";
import { LiveBoard } from "@/components/live-board";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { getExam, liveBoard, managesOrg } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function MonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const { dict } = await getDictionary();
  const exam = await getExam(id);
  if (!exam || !managesOrg(user, exam.organizationId)) return <p>{dict.errors.forbidden}</p>;
  const board = await liveBoard(user, id);
  return (
    <div>
      <PageHeader
        title={dict.monitor.title}
        lede={exam.title}
        actions={<Button variant="outline" className="h-10" render={<Link href={`/exams/${exam.id}`} />}>{dict.nav.exams}</Button>}
      />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{dict.world.board.lead}</p>
      <LiveBoard examId={exam.id} initial={board?.sitting || []} labels={dict.monitor} words={dict.world.board} tabLimit={board?.tabLimit || 0} />
    </div>
  );
}
