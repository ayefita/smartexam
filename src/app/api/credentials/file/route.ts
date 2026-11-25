import { getCurrentUser } from "@/lib/auth";
import { credentialFileRows, examLink, examWindowText, managedExam } from "@/lib/credentials";
import { loginSlipsPdf, loginsXlsx } from "@/lib/exporters";
import { appOrigin } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

// Downloads are built from rows the browser already holds (temporary passwords are never stored).
// Names, emails and ID numbers are re-read from the database, and only managed candidates are included.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || (user.role !== "super_admin" && user.role !== "exam_manager")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) return new Response("Bad request", { status: 400 });
  const { dict, locale } = await getDictionary();
  const rows = await credentialFileRows(
    user,
    body.rows.map((row: Record<string, unknown>) => ({ userId: String(row.userId || ""), password: row.password ? String(row.password) : undefined, status: String(row.status || "") })),
  );
  const exam = body.examId ? await managedExam(user, String(body.examId)) : null;
  const examInfo = exam ? { title: exam.title, window: examWindowText(exam, locale), link: examLink(exam.id) } : null;
  const loginUrl = `${appOrigin()}/login`;
  const slug = (exam?.title || "smartexam").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "smartexam";
  const headers = { "Cache-Control": "no-store" };
  if (body.format === "xlsx") {
    const statusLabel = (status: string) => (status === "created" ? dict.creds.created : status === "reset" ? dict.creds.reset : dict.creds.existing);
    const file = await loginsXlsx({
      rows: rows.map((row) => ({ ...row, statusLabel: statusLabel(row.status) })),
      headers: [dict.creds.colName, dict.creds.colNumber, dict.creds.colEmail, dict.creds.colPassword, dict.creds.colStatus, dict.creds.examName, dict.creds.window, dict.creds.signIn],
      loginUrl,
      exam: examInfo,
    });
    return new Response(file, {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="logins-${slug}.xlsx"` },
    });
  }
  const file = await loginSlipsPdf({
    slips: rows,
    labels: {
      slipTitle: dict.creds.slipTitle,
      colNumber: dict.creds.colNumber,
      username: dict.creds.username,
      password: dict.creds.password,
      exam: dict.creds.examName,
      window: dict.creds.window,
      signIn: dict.creds.signIn,
      slipNote: dict.creds.slipNote,
      unchanged: dict.creds.unchanged,
    },
    loginUrl,
    exam: examInfo,
  });
  return new Response(file, {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="login-slips-${slug}.pdf"` },
  });
}
