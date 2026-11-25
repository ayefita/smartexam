import { ExamPlayer } from "@/components/exam-player";
import { requireUser } from "@/lib/auth";
import { playerPayload } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";
import { redirect } from "next/navigation";

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const user = await requireUser(["candidate"]);
  const { attemptId } = await params;
  const payload = await playerPayload(user, attemptId);
  const { dict } = await getDictionary();
  if (!payload.ok) {
    if (payload.error === "already_submitted" && "attemptId" in payload) redirect(`/results/${attemptId}`);
    return <p role="alert">{dict.errors[payload.error as keyof typeof dict.errors] || dict.errors.generic}</p>;
  }
  return (
    <ExamPlayer
      dict={dict}
      attemptId={payload.attemptId}
      title={payload.examTitle}
      deadlineAt={payload.deadlineAt}
      serverNow={payload.serverNow}
      proctorWebcam={payload.proctorWebcam}
      proctorFullscreen={payload.proctorFullscreen}
      questions={payload.questions}
      initialAnswers={payload.answers}
      blockCopy={payload.blockCopy}
      tabLimit={payload.tabLimit}
      tabSwitchCount={payload.tabSwitchCount}
    />
  );
}
