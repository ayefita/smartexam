import { getCurrentUser } from "@/lib/auth";
import { candidateTemplateXlsx } from "@/lib/exporters";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "super_admin" && user.role !== "exam_manager")) return new Response("Unauthorized", { status: 401 });
  return new Response(await candidateTemplateXlsx(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="candidate-import.xlsx"',
    },
  });
}
