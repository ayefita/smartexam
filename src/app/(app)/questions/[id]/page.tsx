import { notFound } from "next/navigation";
import Link from "next/link";
import { acceptTranslationAction, applyDifficultyAction, checkQuestionAction, deleteQuestionAction, dismissSuggestionAction, publishQuestionAction, translateQuestionAction } from "@/app/actions/staff";
import { AssistNote } from "@/components/assist-note";
import { QuestionForm } from "@/components/question-form";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Pill } from "@/components/ui-app";
import { aiConfigured } from "@/lib/ai";
import { latestSuggestion } from "@/lib/assist";
import { requireUser } from "@/lib/auth";
import { getQuestion, listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function EditQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { id } = await params;
  const question = await getQuestion(user, id);
  if (!question) notFound();
  const { dict } = await getDictionary();
  const query = await searchParams;
  const organizations = user.role === "super_admin" ? await listOrganizations() : [];
  const [quality, translation] = await Promise.all([latestSuggestion("quality", question.id), latestSuggestion("translation", question.id)]);
  const enabled = aiConfigured();
  const duplicates = Array.isArray(quality?.payload.duplicates) ? quality.payload.duplicates as { id?: string; stem?: string; why?: string }[] : [];
  const translatedOptions = Array.isArray(translation?.payload.options) ? translation.payload.options as { text?: string }[] : [];
  return (
    <div className="grid gap-6">
      <PageHeader title={dict.common.edit} actions={<>
        {question.status === "draft" ? <form action={publishQuestionAction}><input type="hidden" name="id" value={question.id} /><Button type="submit" className="h-10">{dict.questions.publish}</Button></form> : <Pill>{dict.status.published}</Pill>}
        <form action={deleteQuestionAction}><input type="hidden" name="id" value={question.id} /><Button type="submit" variant="outline" className="h-10">{dict.common.delete}</Button></form>
      </>} />
      <Notice error text={query.error === "ai_disabled" ? dict.assist.translationOff : query.error ? dict.errors[query.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <section className="grid max-w-2xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-xl">{dict.assist.quality}</h2>
        <p className="text-sm text-muted-foreground">{dict.assist.qualityb}</p>
        <form action={checkQuestionAction}><input type="hidden" name="id" value={question.id} /><Button type="submit" variant="outline" className="h-10">{dict.assist.check}</Button></form>
        {quality && quality.status === "suggested" ? (
          <div className="grid gap-2 text-sm">
            <AssistNote source={quality.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
            <p><span className="font-medium">{dict.assist.ambiguity}. </span>{String(quality.payload.ambiguity || quality.payload.notes || dict.assist.none)}</p>
            <p><span className="font-medium">{dict.assist.wrongKey}. </span>{String(quality.payload.wrongKey || dict.assist.none)}</p>
            <p><span className="font-medium">{dict.assist.estimate}. </span>{dict.difficulty[String(quality.payload.difficulty) as "easy" | "medium" | "hard"] || String(quality.payload.difficulty || "")}</p>
            {duplicates.length ? <ul>{duplicates.map((item) => <li key={String(item.id)}><Link href={`/questions/${item.id}`} className="underline-offset-4 hover:underline">{item.stem}</Link> · {item.why}</li>)}</ul> : <p>{dict.assist.duplicates}: {dict.assist.none}</p>}
            <div className="flex flex-wrap gap-2">
              <form action={applyDifficultyAction}><input type="hidden" name="questionId" value={question.id} /><input type="hidden" name="suggestionId" value={quality.id} /><Button type="submit" className="h-10">{dict.assist.apply}</Button></form>
              <form action={dismissSuggestionAction}><input type="hidden" name="suggestionId" value={quality.id} /><input type="hidden" name="back" value={`/questions/${question.id}`} /><Button type="submit" variant="outline" className="h-10">{dict.assist.dismiss}</Button></form>
            </div>
          </div>
        ) : null}
      </section>
      <section className="grid max-w-2xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-xl">{dict.assist.translate}</h2>
        <p className="text-sm text-muted-foreground">{dict.assist.translateb}</p>
        {!enabled ? <Notice text={dict.assist.translationOff} /> : null}
        <form action={translateQuestionAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={question.id} />
          <label className="text-sm">{dict.assist.translateTo}
            <select name="locale" disabled={!enabled} className="mt-1 block h-11 rounded-lg border border-input bg-card px-3 disabled:opacity-60">
              <option value="am">አማርኛ</option>
              <option value="om">Afaan Oromoo</option>
              <option value="en">English</option>
            </select>
          </label>
          <Button type="submit" className="h-11" disabled={!enabled}>{dict.assist.draftTranslation}</Button>
        </form>
        {translation && translation.status === "suggested" ? (
          <div className="grid gap-2 text-sm">
            <AssistNote source={translation.source} off={dict.assist.off} local={dict.assist.local} model={dict.assist.model} review={dict.assist.review} />
            <p className="font-medium">{String(translation.payload.stem || "")}</p>
            {translatedOptions.map((option, index) => <p key={index}>{option.text}</p>)}
            <form action={acceptTranslationAction}><input type="hidden" name="id" value={question.id} /><input type="hidden" name="suggestionId" value={translation.id} /><Button type="submit" className="h-10">{dict.assist.saveDraft}</Button></form>
          </div>
        ) : null}
      </section>
      <QuestionForm dict={dict} question={question} organizations={organizations} fixedOrg={user.role === "exam_manager" ? user.organizationId || undefined : undefined} />
    </div>
  );
}
