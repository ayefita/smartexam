import { getCurrentUser } from "@/lib/auth";
import { getResultView } from "@/lib/domain";
import { certificatePdf } from "@/lib/exporters";
import { getDictionary } from "@/lib/locale";
import { candidateCanSeeScore } from "@/lib/results";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const view = await getResultView(user, id);
  if (!view || view.attempt.status !== "submitted") return new Response("Not found", { status: 404 });
  const released = candidateCanSeeScore(view.exam, view.attempt);
  if (!view.staff && !released) return new Response("Not released", { status: 403 });
  const { dict, locale } = await getDictionary();
  const pdf = await certificatePdf({
    name: view.attempt.candidateName,
    exam: view.exam.title,
    organization: view.exam.organizationName,
    percentage: view.attempt.percentage,
    score: view.attempt.score,
    max: view.attempt.maxScore,
    passed: view.attempt.passed,
    code: released ? view.attempt.verificationCode : null,
    submittedAt: view.attempt.submittedAt,
    released,
    locale,
    labels: {
      heading: view.attempt.passed ? dict.pdf.certificate : dict.pdf.slip,
      score: dict.results.score,
      passed: dict.status.passed,
      failed: dict.status.failed,
      withheld: dict.pdf.withheld,
      submitted: dict.pdf.submitted,
      code: dict.results.code,
      zone: dict.zone,
      scan: dict.pdf.scan,
      kicker: dict.pdf.kicker,
    },
  });
  return new Response(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="smartexam-result.pdf"` },
  });
}
