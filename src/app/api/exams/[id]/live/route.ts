import { getCurrentUser } from "@/lib/auth";
import { liveBoard } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "forbidden" }, { status: 401 });
  const { id } = await context.params;
  const board = await liveBoard(user, id);
  if (!board) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json(board);
}
