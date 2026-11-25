import { getCurrentUser } from "@/lib/auth";
import { addExtraTime, forceSubmit, reopenAttempt, setAccommodation } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** Invigilator buttons on the Monitor page. Every action checks the staff member manages the exam. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "exam_manager")) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const attemptId = String(body.attemptId || "");
  const minutes = Number(body.minutes || 0);
  switch (body.action) {
    case "extra_time":
      return Response.json(await addExtraTime(user, attemptId, minutes));
    case "force_submit":
      return Response.json(await forceSubmit(user, attemptId));
    case "reopen":
      return Response.json(await reopenAttempt(user, attemptId, minutes));
    case "accommodation":
      return Response.json(await setAccommodation(user, id, String(body.candidateId || ""), minutes));
    default:
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
