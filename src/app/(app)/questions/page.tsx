import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Pill } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { listQuestions, refreshDifficulty } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const user = await requireUser(["super_admin", "exam_manager"]);
  const { dict } = await getDictionary();
  const params = await searchParams;
  await refreshDifficulty(user);
  const questions = await listQuestions(user, { q: params.q, type: params.type });
  return (
    <div>
      <PageHeader title={dict.questions.title} actions={<>
        <Button className="h-10" render={<Link href="/questions/import" />}>{dict.ux.guide.s1Btn}</Button>
        <Button variant="outline" className="h-10" render={<Link href="/questions/new" />}>{dict.questions.new}</Button>
        <Button variant="ghost" className="h-10" render={<Link href="/questions/generate" />}>{dict.ai.title}</Button>
      </>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={params.q} placeholder={dict.common.search} aria-label={dict.common.search} className="h-11 min-w-48 flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
        <select name="type" defaultValue={params.type || ""} aria-label={dict.common.type} className="h-11 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">{dict.common.all}</option>
          {Object.entries(dict.qtype).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <Button type="submit" variant="outline" className="h-11">{dict.common.search}</Button>
      </form>
      <div className="grid gap-2">
        {questions.length === 0 ? (params.q || params.type ? <EmptyState title={dict.ux.empty.noMatch} /> : <EmptyState title={dict.ux.empty.questions} help={dict.ux.empty.questionsHelp} action={<Button className="h-11" render={<Link href="/questions/import" />}>{dict.ux.guide.s1Btn}</Button>} />) : questions.map((question) => (
          <Link key={question.id} href={`/questions/${question.id}`} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <div className="flex flex-wrap gap-2">
              <Pill>{dict.qtype[question.type]}</Pill>
              <Pill>{question.subject}</Pill>
              <Pill>{dict.difficulty[question.difficulty]}</Pill>
              {question.status === "draft" ? <Pill tone="wait">{dict.status.draft}</Pill> : null}
              {question.timesAsked > 0 ? <Pill>{dict.questions.observed} {question.observedRate}%</Pill> : null}
              {question.calibratedDifficulty ? <Pill tone="good">{dict.questions.calibrated}: {dict.difficulty[question.calibratedDifficulty]}</Pill> : null}
            </div>
            <p className="mt-2 text-sm">{question.stem}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
