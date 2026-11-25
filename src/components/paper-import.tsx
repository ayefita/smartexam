"use client";

import { useActionState, useEffect, useState } from "react";
import { readPaperAction, savePaperAction, type PaperState } from "@/app/actions/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect, Notice } from "@/components/ui-app";
import { fill, type Dictionary } from "@/lib/i18n";

type Row = { stem: string; options: string[]; answer: string; difficulty: string; keep: boolean };
const LETTERS = "ABCDEF";

function problemOf(row: Row) {
  const options = row.options.filter((option) => option.trim());
  if (!row.stem.trim()) return "no_stem";
  if (options.length < 2) return "no_options";
  if (!row.answer) return "no_answer";
  if (!LETTERS.slice(0, row.options.length).includes(row.answer) || !row.options[LETTERS.indexOf(row.answer)]?.trim()) return "bad_answer";
  return "";
}

export function PaperImport({ dict, organizations, organizationId }: { dict: Dictionary; organizations: { id: string; name: string }[]; organizationId: string }) {
  const w = dict.world.paper;
  const [state, action] = useActionState<PaperState, FormData>(readPaperAction, {});
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    setRows((state.questions || []).map((question) => ({ ...question, difficulty: "medium", keep: true })));
  }, [state.questions]);
  const kept = rows.filter((row) => row.keep);
  const broken = kept.filter((row) => problemOf(row));
  const ready = kept.length - broken.length;
  const change = (index: number, patch: Partial<Row>) => setRows((all) => all.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const error = state.error ? (w.errors as Record<string, string>)[state.error] || dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : "";

  return (
    <section className="grid gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10" aria-labelledby="paper-title">
      <div>
        <h2 id="paper-title" className="font-heading text-xl">{w.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{w.lead}</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{w.example}</pre>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <Field label={w.file}><Input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="h-11" /></Field>
        <Button type="submit" variant={rows.length ? "outline" : "default"} className="h-11 px-5">{w.read}</Button>
      </form>
      <Notice error text={error} />
      {rows.length ? (
        <form action={savePaperAction} className="grid gap-4" id="paper-preview">
          <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="status">
            {fill(w.found, { n: rows.length, file: state.fileName || "" })} {broken.length ? fill(w.fix, { n: broken.length }) : w.allGood}
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {organizations.length > 1 ? (
              <Field label={dict.auth.organization}>
                <NativeSelect name="organizationId" defaultValue={organizationId}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</NativeSelect>
              </Field>
            ) : <input type="hidden" name="organizationId" value={organizationId} />}
            <Field label={w.subject}><Input name="subject" required placeholder="Biology" className="h-11" /></Field>
            <Field label={w.topic}><Input name="topic" className="h-11" /></Field>
            <Field label={w.points}><Input name="points" type="number" min={1} max={20} defaultValue={1} className="h-11 w-24" /></Field>
          </div>
          <ol className="grid gap-3">
            {rows.map((row, index) => {
              const problem = row.keep ? problemOf(row) : "";
              return (
                <li key={index} className={`grid gap-2 rounded-xl p-3 ring-1 ${!row.keep ? "opacity-60 ring-foreground/10" : problem ? "bg-[#fdf1f3] ring-[#d9a3ad]" : "ring-foreground/10"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{fill(w.number, { n: index + 1 })}</span>
                    {problem ? <span className="text-sm font-medium text-[#8e1e32]" role="alert">{(w.problems as Record<string, string>)[problem]}</span> : row.keep ? <span className="text-sm text-[#0c5c40]">✓ {w.ok}</span> : null}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.keep} onChange={(event) => change(index, { keep: event.target.checked })} className="size-4 accent-[#0c5c40]" /> {w.keep}</label>
                  </div>
                  <Textarea aria-label={w.question} value={row.stem} onChange={(event) => change(index, { stem: event.target.value })} className="min-h-16" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {row.options.map((option, at) => (
                      <label key={at} className="flex items-center gap-2 text-sm">
                        <span className="w-5 font-semibold">{LETTERS[at]}</span>
                        <Input value={option} onChange={(event) => change(index, { options: row.options.map((value, i) => (i === at ? event.target.value : value)) })} className="h-10" />
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {row.options.length < 6 ? <Button type="button" variant="ghost" className="h-9" onClick={() => change(index, { options: [...row.options, ""] })}>{w.addOption}</Button> : null}
                    <label className="flex items-center gap-2">{w.answer}
                      <select value={row.answer} onChange={(event) => change(index, { answer: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2">
                        <option value="">—</option>
                        {row.options.map((_, at) => <option key={at} value={LETTERS[at]}>{LETTERS[at]}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2">{w.level}
                      <select value={row.difficulty} onChange={(event) => change(index, { difficulty: event.target.value })} className="h-9 rounded-md border border-input bg-background px-2">
                        <option value="easy">{dict.difficulty.easy}</option>
                        <option value="medium">{dict.difficulty.medium}</option>
                        <option value="hard">{dict.difficulty.hard}</option>
                      </select>
                    </label>
                  </div>
                </li>
              );
            })}
          </ol>
          <input type="hidden" name="questions" value={JSON.stringify(kept.filter((row) => !problemOf(row)).map(({ stem, options, answer, difficulty }) => ({ stem, options, answer, difficulty })))} />
          <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl bg-card/95 p-3 ring-1 ring-foreground/10 backdrop-blur">
            <Button type="submit" className="h-11 px-5" disabled={!ready}>{fill(w.save, { n: ready })}</Button>
            {broken.length ? <span className="text-sm text-[#8e1e32]">{fill(w.skipNote, { n: broken.length })}</span> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
