import { getCurrentUser } from "@/lib/auth";
import { claimAttempt, heartbeat, logProctor, saveAnswer, submitAttempt } from "@/lib/domain";

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "forbidden" }, { status: 401 });
  if (user.mustChangePassword) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id, action } = await context.params;
  const body = await request.json().catch(() => ({}));
  const tabId = String(body.tabId || "");
  if (action === "claim") return Response.json(await claimAttempt(user, id, tabId));
  if (action === "answer") {
    return Response.json(await saveAnswer(user, {
      attemptId: id,
      tabId,
      questionId: String(body.questionId || ""),
      selected: Array.isArray(body.selected) ? body.selected.map(String) : [],
      text: String(body.text || ""),
      matching: body.matching && typeof body.matching === "object" ? body.matching : {},
      flagged: Boolean(body.flagged),
    }));
  }
  if (action === "proctor") {
    return Response.json(await logProctor(user, {
      attemptId: id,
      tabId,
      kind: String(body.kind || ""),
      detail: String(body.detail || ""),
      snapshot: String(body.snapshot || ""),
    }));
  }
  if (action === "heartbeat") return Response.json(await heartbeat(user, id, tabId));
  if (action === "submit") return Response.json(await submitAttempt(user, id, tabId, body.reason === "timer" ? "timer" : "manual"));
  return Response.json({ error: "not_found" }, { status: 404 });
}
