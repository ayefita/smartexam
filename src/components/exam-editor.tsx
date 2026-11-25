"use client";

import { useMemo, useState } from "react";
import { saveExamAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/ui-app";
import { defaultReleaseAt } from "@/lib/results";
import { fromAddisInput, toAddisInput } from "@/lib/format";
import { fill, type Dictionary } from "@/lib/i18n";
import type { Category, Department, Exam, Organization } from "@/lib/types";

type BankItem = { id: string; stem: string; type: string; subject: string; difficulty: string; points: number; organizationId?: string };

export function ExamEditor({
  dict,
  exam,
  organizations,
  categories,
  departments,
  bank,
  selectedIds,
  locked,
  fixedOrg,
}: {
  dict: Dictionary;
  exam?: Exam;
  organizations: Organization[];
  categories: Category[];
  departments: Department[];
  bank: BankItem[];
  selectedIds: string[];
  locked: boolean;
  fixedOrg?: string;
}) {
  const t = dict.ux.editor;
  const [release, setRelease] = useState(exam?.resultRelease || "instant");
  const [startAt, setStartAt] = useState(toAddisInput(exam?.startAt || null));
  const [endAt, setEndAt] = useState(toAddisInput(exam?.endAt || null));
  const [duration, setDuration] = useState(exam?.durationMinutes || 30);
  const [overridden, setOverridden] = useState(exam?.releaseOverridden || false);
  const [releaseAt, setReleaseAt] = useState(toAddisInput(exam?.resultReleaseAt || null));
  const [mode, setMode] = useState(exam?.selectionMode || "manual");
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(exam?.randomCount || 5);
  const [shuffle, setShuffle] = useState(exam ? exam.shuffleQuestions || exam.shuffleOptions : true);
  const [orgId, setOrgId] = useState(exam?.organizationId || fixedOrg || organizations[0]?.id || "");
  const visibleBank = useMemo(() => bank.filter((item) => !item.organizationId || item.organizationId === orgId), [bank, orgId]);
  const subjects = useMemo(() => [...new Set(visibleBank.map((item) => item.subject))].sort(), [visibleBank]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return visibleBank.filter((item) => (!subject || item.subject === subject) && (!difficulty || item.difficulty === difficulty) && (!needle || item.stem.toLowerCase().includes(needle)));
  }, [visibleBank, subject, difficulty, search]);
  const points = useMemo(() => {
    const byId = new Map(bank.map((item) => [item.id, item.points]));
    return selected.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
  }, [bank, selected]);
  const suggestedEnd = addMinutes(startAt, duration + 15);

  function computedRelease(nextEnd = endAt) {
    const iso = fromAddisInput(nextEnd);
    return toAddisInput(defaultReleaseAt(iso));
  }

  function onEnd(value: string) {
    setEndAt(value);
    if (release === "scheduled" && !overridden) setReleaseAt(computedRelease(value));
  }

  function onStart(value: string) {
    setStartAt(value);
    if (!endAt && value) onEnd(addMinutes(value, duration + 15));
  }

  function onRelease(value: "instant" | "scheduled") {
    setRelease(value);
    if (value === "scheduled") {
      setOverridden(false);
      setReleaseAt(computedRelease());
    }
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAllShown() {
    setSelected((current) => [...new Set([...current, ...filtered.map((item) => item.id)])]);
  }

  function draw() {
    const copy = [...filtered];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    setSelected(copy.slice(0, Math.min(count, copy.length)).map((item) => item.id));
  }

  const orgDepartments = departments.filter((item) => item.organizationId === orgId);
  const checkbox = "size-5 accent-[#0c5c40]";

  return (
    <form action={saveExamAction} className="grid max-w-3xl gap-5">
      {exam ? <input type="hidden" name="id" value={exam.id} /> : null}
      <input type="hidden" name="questionIds" value={selected.join(",")} />
      <input type="hidden" name="releaseOverridden" value={overridden ? "1" : "0"} />
      {shuffle ? <><input type="hidden" name="shuffleQuestions" value="on" /><input type="hidden" name="shuffleOptions" value="on" /></> : null}
      {fixedOrg ? <input type="hidden" name="organizationId" value={fixedOrg} /> : (
        <Field label={t.school}>
          <NativeSelect name="organizationId" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label={t.name} hint={t.nameHelp}><Input name="title" required defaultValue={exam?.title} className="h-11 text-base" /></Field>
      <Field label={t.instructions} hint={t.instructionsHelp}><Textarea name="instructions" defaultValue={exam?.instructions} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.duration} hint={t.durationHelp}><Input name="durationMinutes" type="number" min={1} max={360} required value={duration} onChange={(event) => setDuration(Number(event.target.value) || 0)} className="h-11" /></Field>
        <Field label={t.pass} hint={t.passHelp}><Input name="passMark" type="number" min={0} max={100} defaultValue={exam?.passMark ?? 50} className="h-11" /></Field>
        <Field label={t.start} hint={t.startHelp}><Input name="startAt" type="datetime-local" value={startAt} onChange={(event) => onStart(event.target.value)} className="h-11" /></Field>
        <div className="grid gap-1.5">
          <Field label={t.end} hint={t.endHelp}><Input name="endAt" type="datetime-local" value={endAt} onChange={(event) => onEnd(event.target.value)} className="h-11" /></Field>
          {suggestedEnd && suggestedEnd !== endAt ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {fill(t.suggest, { time: suggestedEnd.replace("T", " ") })}
              <button type="button" className="font-medium text-primary underline underline-offset-4" onClick={() => onEnd(suggestedEnd)}>{t.useSuggest}</button>
            </p>
          ) : null}
        </div>
      </div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className={checkbox} checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} /> <span>{t.shuffle}</span></label>

      <fieldset className="grid gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 font-heading text-lg">{t.pick}</legend>
        {locked ? <p className="text-sm text-muted-foreground">{t.locked}</p> : visibleBank.length === 0 ? <p className="text-sm text-muted-foreground">{t.noBank}</p> : (
          <>
            <p className="text-sm text-muted-foreground">{t.pickHelp}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} className="h-11" />
              <NativeSelect value={subject} onChange={(event) => setSubject(event.target.value)} aria-label={dict.common.subject}>
                <option value="">{t.allSubjects}</option>
                {subjects.map((item) => <option key={item}>{item}</option>)}
              </NativeSelect>
              <NativeSelect value={difficulty} onChange={(event) => setDifficulty(event.target.value)} aria-label={t.allLevels}>
                <option value="">{t.allLevels}</option>
                {Object.entries(dict.difficulty).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={selectAllShown} disabled={!filtered.length}>{fill(t.selectAll, { n: filtered.length })}</Button>
              <Button type="button" variant="ghost" className="h-10" onClick={() => setSelected([])} disabled={!selected.length}>{t.clear}</Button>
              <p className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary" aria-live="polite">{fill(t.selected, { n: selected.length, p: points })}</p>
            </div>
            <div className="grid max-h-96 gap-1 overflow-auto rounded-xl bg-muted/40 p-1">
              {filtered.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t.noMatch}</p> : filtered.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-background">
                  <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className={`mt-0.5 ${checkbox}`} />
                  <span><span className="text-xs text-muted-foreground">{item.subject} · {dict.difficulty[item.difficulty as keyof typeof dict.difficulty] || item.difficulty} · {item.points} {dict.common.points}</span><br />{item.stem}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </fieldset>

      <details className="rounded-2xl bg-muted/60 p-4">
        <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-primary">{t.advanced}</summary>
        <p className="mt-1 text-sm text-muted-foreground">{t.advancedHelp}</p>
        <div className="mt-4 grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t.show}</legend>
            <label className="flex items-start gap-3 text-sm"><input type="radio" className={checkbox} name="resultRelease" value="instant" checked={release === "instant"} onChange={() => onRelease("instant")} /> <span>{t.now}</span></label>
            <label className="flex items-start gap-3 text-sm"><input type="radio" className={checkbox} name="resultRelease" value="scheduled" checked={release === "scheduled"} onChange={() => onRelease("scheduled")} /> <span>{t.later}<span className="block text-xs text-muted-foreground">{t.laterHelp}</span></span></label>
            {release === "scheduled" ? (
              <Field label={t.date}>
                <Input name="resultReleaseAt" type="datetime-local" value={releaseAt} onChange={(event) => { setOverridden(true); setReleaseAt(event.target.value); }} className="h-11" />
              </Field>
            ) : <input type="hidden" name="resultReleaseAt" value="" />}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.category}>
              <NativeSelect name="categoryId" defaultValue={exam?.categoryId || categories[0]?.id}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn}</option>)}
              </NativeSelect>
            </Field>
            <Field label={t.department}>
              <NativeSelect name="departmentId" defaultValue={exam?.departmentId || ""}>
                <option value="">{dict.common.all}</option>
                {orgDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label={t.description}><Textarea name="description" defaultValue={exam?.description} /></Field>
          <Field label={t.mode}>
            <NativeSelect name="selectionMode" value={mode} onChange={(event) => setMode(event.target.value as Exam["selectionMode"])} disabled={locked}>
              <option value="manual">{t.manual}</option>
              <option value="random_fixed">{dict.exams.randomFixed}</option>
              <option value="random_each">{t.random}</option>
            </NativeSelect>
          </Field>
          {mode !== "manual" && !locked ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t.each}><Input type="number" min={1} value={count} onChange={(event) => setCount(Number(event.target.value))} className="h-11 w-28" /></Field>
              {mode === "random_fixed" ? <Button type="button" variant="outline" className="h-11" onClick={draw}>{dict.exams.draw}</Button> : null}
            </div>
          ) : null}
          {mode === "random_each" ? <input type="hidden" name="randomCount" value={count} /> : <input type="hidden" name="randomCount" value={selected.length} />}
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className={checkbox} name="proctorWebcam" defaultChecked={exam?.proctorWebcam} /> {t.webcam}</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className={checkbox} name="proctorFullscreen" defaultChecked={exam?.proctorFullscreen ?? true} /> {t.fullscreen}</label>
          <Field label={t.status}>
            <NativeSelect name="status" defaultValue={exam?.status || "draft"}>
              <option value="draft">{dict.status.draft}</option>
              <option value="published">{dict.status.published}</option>
              <option value="closed">{dict.status.closed}</option>
            </NativeSelect>
          </Field>
        </div>
      </details>
      <Button type="submit" className="h-12 w-fit px-6 text-base">{exam ? t.save : t.create}</Button>
    </form>
  );
}

/** Adds minutes to a datetime-local value ("YYYY-MM-DDTHH:mm") without changing its time zone. */
function addMinutes(value: string, minutes: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!match || !Number.isFinite(minutes)) return "";
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5] + minutes));
  return date.toISOString().slice(0, 16);
}
