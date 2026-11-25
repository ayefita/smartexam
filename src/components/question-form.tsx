"use client";

import { useState } from "react";
import { saveQuestionAction } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/ui-app";
import type { Dictionary } from "@/lib/i18n";
import type { Organization, Question } from "@/lib/types";

export function QuestionForm({
  dict,
  question,
  organizations,
  fixedOrg,
}: {
  dict: Dictionary;
  question?: Question;
  organizations: Organization[];
  fixedOrg?: string;
}) {
  const [type, setType] = useState(question?.type || "single");
  const [options, setOptions] = useState(question?.options?.length ? question.options : [{ id: "", text: "" }, { id: "", text: "" }, { id: "", text: "" }, { id: "", text: "" }]);
  const [pairs, setPairs] = useState(question?.pairs?.length ? question.pairs : [{ id: "", left: "", right: "" }, { id: "", left: "", right: "" }]);
  const correct = new Set(question?.correctOptionIds || []);
  return (
    <form action={saveQuestionAction} className="grid max-w-3xl gap-4">
      {question ? <input type="hidden" name="id" value={question.id} /> : null}
      {fixedOrg ? <input type="hidden" name="organizationId" value={fixedOrg} /> : (
        <Field label={dict.auth.organization}>
          <NativeSelect name="organizationId" defaultValue={question?.organizationId || organizations[0]?.id}>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label={dict.common.type}>
        <NativeSelect name="type" value={type} onChange={(event) => setType(event.target.value as Question["type"])}>
          {Object.entries(dict.qtype).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </NativeSelect>
      </Field>
      <Field label={dict.questions.stem}>
        <Textarea name="stem" required defaultValue={question?.stem} className="min-h-24 text-base" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.common.subject}><Input name="subject" required defaultValue={question?.subject} className="h-11" /></Field>
        <Field label={dict.common.topic}><Input name="topic" defaultValue={question?.topic} className="h-11" /></Field>
        <Field label={dict.common.type}>
          <NativeSelect name="difficulty" defaultValue={question?.difficulty || "medium"}>
            {Object.entries(dict.difficulty).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect>
        </Field>
        <Field label={dict.common.points}><Input name="points" type="number" min={1} max={100} defaultValue={question?.points || 1} className="h-11" /></Field>
      </div>
      {type === "true_false" ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{dict.questions.correct}</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="tf" value="true" defaultChecked={question?.correctOptionIds?.[0] !== "false"} /> {dict.player.true}</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="tf" value="false" defaultChecked={question?.correctOptionIds?.[0] === "false"} /> {dict.player.false}</label>
        </fieldset>
      ) : null}
      {type === "single" || type === "multiple" ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{dict.questions.correct}</legend>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input type="hidden" name={`option_id_${index}`} value={option.id} />
              <input type={type === "single" ? "radio" : "checkbox"} name="correct" value={String(index)} defaultChecked={correct.has(option.id)} aria-label={dict.questions.correct} />
              <Input name={`option_${index}`} defaultValue={option.text} className="h-11" aria-label={`${dict.questions.addOption} ${index + 1}`} />
            </div>
          ))}
          <Button type="button" variant="outline" className="h-10 w-fit" onClick={() => setOptions((items) => [...items, { id: crypto.randomUUID(), text: "" }])}>{dict.questions.addOption}</Button>
        </fieldset>
      ) : null}
      {type === "short" || type === "blank" ? (
        <Field label={dict.questions.accepted}>
          <Textarea name="accepted" defaultValue={question?.acceptedAnswers?.join("\n")} className="min-h-24" />
        </Field>
      ) : null}
      {type === "matching" ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{dict.questions.pairs}</legend>
          {pairs.map((pair, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name={`pair_id_${index}`} value={pair.id} />
              <Input name={`left_${index}`} defaultValue={pair.left} placeholder={dict.questions.left} className="h-11" aria-label={dict.questions.left} />
              <Input name={`right_${index}`} defaultValue={pair.right} placeholder={dict.questions.right} className="h-11" aria-label={dict.questions.right} />
            </div>
          ))}
          <Button type="button" variant="outline" className="h-10 w-fit" onClick={() => setPairs((items) => [...items, { id: crypto.randomUUID(), left: "", right: "" }])}>{dict.questions.addPair}</Button>
        </fieldset>
      ) : null}
      <Field label={dict.questions.explanation}><Textarea name="explanation" defaultValue={question?.explanation} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.questions.media}>
          <NativeSelect name="mediaKind" defaultValue={question?.mediaKind || "image"}>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </NativeSelect>
        </Field>
        <Field label={dict.questions.alt}><Input name="mediaAlt" defaultValue={question?.mediaAlt} className="h-11" /></Field>
      </div>
      <Field label="URL" hint={dict.errors.media_url}><Input name="mediaUrl" defaultValue={question?.mediaUrl?.startsWith("data:") ? "" : question?.mediaUrl} className="h-11" /></Field>
      <Field label={dict.questions.media}><Input name="mediaFile" type="file" accept="image/*,audio/*" className="h-11" /></Field>
      <Button type="submit" className="h-11 w-fit">{dict.common.save}</Button>
    </form>
  );
}
