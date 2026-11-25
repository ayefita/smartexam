import { getCurrentUser } from "@/lib/auth";
import { candidateHistory, cohortAverages, topicStrength } from "@/lib/domain";
import { studentReportPdf } from "@/lib/exporters";
import { getDictionary } from "@/lib/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const history = await candidateHistory(user, id);
  if (!history) return new Response("Not found", { status: 404 });
  const topics = await topicStrength(user, id);
  const averages = await cohortAverages(history.items.map((item) => item.examId));
  const visible = history.items.filter((item) => item.showScore && item.percentage != null);
  const yours = visible.length ? Math.round((visible.reduce((sum, item) => sum + (item.percentage || 0), 0) / visible.length) * 10) / 10 : null;
  const cohortValues = visible.map((item) => averages.get(item.examId)).filter((value): value is number => value != null);
  const cohort = cohortValues.length ? Math.round((cohortValues.reduce((sum, value) => sum + value, 0) / cohortValues.length) * 10) / 10 : null;
  const { dict } = await getDictionary();
  const pdf = await studentReportPdf({
    name: history.person.fullName,
    email: history.person.email,
    average: yours,
    cohort,
    exams: history.items.map((item) => ({
      title: item.title,
      percentage: item.percentage,
      cohort: averages.get(item.examId) ?? null,
      withheld: !item.showScore,
    })),
    topics: (topics?.topics || []).map((topic) => ({
      topic: topic.topic,
      percent: topic.possible ? Math.round((topic.earned / topic.possible) * 100) : 0,
    })),
    labels: {
      title: dict.features.student,
      history: dict.nav.history,
      topics: dict.dash.topicTitle,
      yours: dict.features.yours,
      cohort: dict.features.cohort,
      withheld: dict.pdf.withheld,
    },
  });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=\"smartexam-performance.pdf\"",
    },
  });
}
