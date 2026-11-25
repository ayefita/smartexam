"use client";

import { useMemo, useState } from "react";
import { saveExamAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/ui-app";
import { defaultReleaseAt } from "@/lib/results";
import { fromAddisInput, toAddisInput } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
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
  const [release, setRelease] = useState(exam?.resultRelease || "instant");
  const [endAt, setEndAt] = useState(toAddisInput(exam?.endAt || null));
  const [overridden, setOverridden] = useState(exam?.releaseOverridden || false);
  const [releaseAt, setReleaseAt] = useState(toAddisInput(exam?.resultReleaseAt || null));
  const [mode, setMode] = useState(exam?.selectionMode || "manual");
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [count, setCount] = useState(exam?.randomCount || 5);
  const [orgId, setOrgId] = useState(exam?.organizationId || fixedOrg || organizations[0]?.id || "");
  const visibleBank = useMemo(() => bank.filter((item) => !item.organizationId || item.organizationId === orgId), [bank, orgId]);
  const subjects = useMemo(() => [...new Set(visibleBank.map((item) => item.subject))].sort(), [visibleBank]);

  function computedRelease(nextEnd = endAt) {
    const iso = fromAddisInput(nextEnd);
    return toAddisInput(defaultReleaseAt(iso));
  }

  function onEnd(value: string) {
    setEndAt(value);
    if (release === "scheduled" && !overridden) setReleaseAt(computedRelease(value));
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

  function draw() {
    let pool = visibleBank;
    if (subject) pool = pool.filter((item) => item.subject === subject);
    if (difficulty) pool = pool.filter((item) => item.difficulty === difficulty);
    const copy = [...pool];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    setSelected(copy.slice(0, Math.min(count, copy.length)).map((item) => item.id));
  }

  const orgDepartments = departments.filter((item) => item.organizationId === orgId);

  return (
    <form action={saveExamAction} className="grid max-w-3xl gap-4">
      {exam ? <input type="hidden" name="id" value={exam.id} /> : null}
      <input type="hidden" name="questionIds" value={selected.join(",")} />
      <input type="hidden" name="releaseOverridden" value={overridden ? "1" : "0"} />
      {fixedOrg ? <input type="hidden" name="organizationId" value={fixedOrg} /> : (
        <Field label={dict.auth.organization}>
          <NativeSelect name="organizationId" value={orgId} onChange={(event) => setOrgId(event.target.value)}>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label={dict.common.name}><Input name="title" required defaultValue={exam?.title} className="h-11" /></Field>
      <Field label={dict.common.description}><Textarea name="description" defaultValue={exam?.description} /></Field>
      <Field label={dict.exams.instructions}><Textarea name="instructions" defaultValue={exam?.instructions} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.nav.categories}>
          <NativeSelect name="categoryId" defaultValue={exam?.categoryId || categories[0]?.id}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn}</option>)}
          </NativeSelect>
        </Field>
        <Field label={dict.nav.departments}>
          <NativeSelect name="departmentId" defaultValue={exam?.departmentId || ""}>
            <option value="">{dict.common.all}</option>
            {orgDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={dict.exams.duration}><Input name="durationMinutes" type="number" min={1} max={360} defaultValue={exam?.durationMinutes || 30} className="h-11" /></Field>
        <Field label={dict.exams.pass}><Input name="passMark" type="number" min={0} max={100} defaultValue={exam?.passMark ?? 50} className="h-11" /></Field>
        <Field label={dict.exams.start}><Input name="startAt" type="datetime-local" defaultValue={toAddisInput(exam?.startAt || null)} className="h-11" /></Field>
        <Field label={dict.exams.end}><Input name="endAt" type="datetime-local" value={endAt} onChange={(event) => onEnd(event.target.value)} className="h-11" /></Field>
      </div>
      <fieldset className="grid gap-2 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">{dict.release.scheduled}</legend>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="resultRelease" value="instant" checked={release === "instant"} onChange={() => onRelease("instant")} /> <span><strong>{dict.release.instant}.</strong> {dict.release.instantHelp}</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="resultRelease" value="scheduled" checked={release === "scheduled"} onChange={() => onRelease("scheduled")} /> <span><strong>{dict.release.scheduled}.</strong> {dict.release.scheduledHelp}</span></label>
        {release === "scheduled" ? (
          <Field label={dict.release.date}>
            <Input
              name="resultReleaseAt"
              type="datetime-local"
              value={releaseAt}
              onChange={(event) => {
                setOverridden(true);
                setReleaseAt(event.target.value);
              }}
              className="h-11"
            />
          </Field>
        ) : <input type="hidden" name="resultReleaseAt" value="" />}
      </fieldset>
      <Field label={dict.exams.mode}>
        <NativeSelect name="selectionMode" value={mode} onChange={(event) => setMode(event.target.value as Exam["selectionMode"])} disabled={locked}>
          <option value="manual">{dict.exams.manual}</option>
          <option value="random_fixed">{dict.exams.randomFixed}</option>
          <option value="random_each">{dict.exams.randomEach}</option>
        </NativeSelect>
      </Field>
      {mode === "random_each" ? <Field label={dict.exams.each}><Input name="randomCount" type="number" min={1} value={count} onChange={(event) => setCount(Number(event.target.value))} className="h-11" /></Field> : <input type="hidden" name="randomCount" value={selected.length} />}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffleQuestions" defaultChecked={exam?.shuffleQuestions ?? true} /> {dict.exams.shuffleQ}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffleOptions" defaultChecked={exam?.shuffleOptions ?? true} /> {dict.exams.shuffleO}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="proctorWebcam" defaultChecked={exam?.proctorWebcam} /> {dict.exams.webcam}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="proctorFullscreen" defaultChecked={exam?.proctorFullscreen ?? true} /> {dict.exams.fullscreen}</label>
      <Field label={dict.exams.publish}>
        <NativeSelect name="status" defaultValue={exam?.status || "draft"}>
          <option value="draft">{dict.status.draft}</option>
          <option value="published">{dict.status.published}</option>
          <option value="closed">{dict.status.closed}</option>
        </NativeSelect>
      </Field>
      {locked ? <p className="text-sm text-muted-foreground">{dict.exams.locked}</p> : (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <NativeSelect value={subject} onChange={(event) => setSubject(event.target.value)} className="max-w-48">
              <option value="">{dict.common.subject}</option>
              {subjects.map((item) => <option key={item}>{item}</option>)}
            </NativeSelect>
            <NativeSelect value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="max-w-40">
              <option value="">{dict.difficulty.easy}/{dict.difficulty.hard}</option>
              {Object.entries(dict.difficulty).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
            {mode !== "random_each" ? <Input type="number" min={1} value={count} onChange={(event) => setCount(Number(event.target.value))} className="h-11 w-24" aria-label={dict.exams.each} /> : null}
            <Button type="button" variant="outline" className="h-11" onClick={draw}>{dict.exams.draw}</Button>
          </div>
          <p className="mb-2 text-sm font-medium">{dict.exams.pool} ({selected.length})</p>
          <div className="grid max-h-80 gap-1 overflow-auto">
            {visibleBank.map((item) => (
              <label key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1" />
                <span><span className="text-muted-foreground">{dict.qtype[item.type as keyof typeof dict.qtype] || item.type} · {item.subject}</span><br />{item.stem}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <Button type="submit" className="h-11 w-fit">{dict.common.save}</Button>
    </form>
  );
}
