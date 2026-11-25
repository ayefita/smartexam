import { gradeAction, suggestGradeAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Notice, PageHeader } from "@/components/ui-app";
import { latestSuggestion } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { getResultView } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function GradePage({ params, searchParams }: { params: Promise<{ attemptId: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { attemptId } = await params;
  const view = await getResultView(user, attemptId);
  const { dict } = await getDictionary();
  const query = await searchParams;
  if (!view?.staff) return <p>{dict.errors.forbidden}</p>;
  const written = view.review.filter((item) => item.question.type === "essay" || item.question.type === "short" || item.question.type === "blank");
  const suggestions = await Promise.all(written.map((item) => latestSuggestion("grade", `${attemptId}:${item.question.id}`)));
  return (
    <div>
      <PageHeader title={dict.grade.title} lede={`${view.attempt.candidateName} · ${view.exam.title}`} />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{dict.assist.gradeb}</p>
      <Notice error text={query.error ? dict.errors[query.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      {written.length === 0 ? <p className="text-sm text-muted-foreground">{dict.assist.emptyWritten}</p> : null}
      <div className="mb-4 grid max-w-2xl gap-2">
        {written.map(({ question }) => (
          <form key={question.id} action={suggestGradeAction} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <input type="hidden" name="attemptId" value={attemptId} />
            <input type="hidden" name="questionId" value={question.id} />
            <p className="text-sm">{question.stem}</p>
            <Button type="submit" variant="outline" className="h-10">{dict.assist.suggest}</Button>
          </form>
        ))}
      </div>
      <form action={gradeAction} className="grid max-w-2xl gap-4">
        <input type="hidden" name="attemptId" value={attemptId} />
        {written.map(({ question, answer }, index) => {
          const suggestion = suggestions[index];
          const open = suggestion && suggestion.status === "suggested";
          const payload = suggestion?.payload || {};
          const rubric = Array.isArray(payload.rubric) ? payload.rubric as { criterion?: string; awarded?: number; max?: number; note?: string }[] : [];
          const suggestedPoints = typeof payload.points === "number" ? payload.points : Number(payload.points);
          return (
            <fieldset key={question.id} className="grid gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <input type="hidden" name="essayId" value={question.id} />
              {suggestion ? <input type="hidden" name={`suggestion_${question.id}`} value={suggestion.id} /> : null}
              <legend className="font-medium">{question.stem}</legend>
              <p className="text-xs text-muted-foreground">{dict.qtype[question.type]} · {question.points} {dict.common.points}</p>
              <p className="whitespace-pre-wrap text-sm">{answer?.textAnswer || "—"}</p>
              {open ? (
                <div className="rounded-lg bg-[#f8efd4] p-3 text-sm">
                  <AssistNote source={suggestion.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
                  <p className="mt-2 font-medium">{dict.assist.rubric}: {suggestedPoints}/{question.points}</p>
                  <ul className="mt-1 grid gap-1">
                    {rubric.map((line, lineIndex) => (
                      <li key={lineIndex}>{line.criterion} · {line.awarded}/{line.max}. {line.note}</li>
                    ))}
                  </ul>
                  {payload.comment ? <p className="mt-2">{String(payload.comment)}</p> : null}
                </div>
              ) : null}
              <label className="text-sm">{dict.grade.points} / {question.points}<Input name={`points_${question.id}`} type="number" min={0} max={question.points} defaultValue={open && Number.isFinite(suggestedPoints) ? suggestedPoints : answer?.pointsAwarded ?? 0} className="mt-1 h-11" /></label>
              <label className="text-sm">{dict.grade.comment}<Textarea name={`comment_${question.id}`} defaultValue={open ? String(payload.comment || answer?.manualComment || "") : answer?.manualComment} className="mt-1" /></label>
            </fieldset>
          );
        })}
        {written.length ? <Button type="submit" className="h-11 w-fit">{dict.grade.save}</Button> : null}
      </form>
    </div>
  );
}
