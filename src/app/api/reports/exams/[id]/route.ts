import { getCurrentUser } from "@/lib/auth";
import { examReport } from "@/lib/domain";
import { reportCsv, reportPdf, reportXlsx } from "@/lib/exporters";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const report = await examReport(user, id);
  if (!report) return new Response("Not found", { status: 404 });
  const format = new URL(request.url).searchParams.get("format");
  const slug = report.exam.title.replace(/[^\w]+/g, "-").slice(0, 40);
  if (format === "xlsx") {
    const body = await reportXlsx(report);
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slug}.xlsx"`,
      },
    });
  }
  if (format === "pdf") {
    const body = await reportPdf(report);
    return new Response(body, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug}.pdf"` },
    });
  }
  return new Response(reportCsv(report), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.csv"` },
  });
}
