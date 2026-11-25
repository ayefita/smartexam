"use client";

import { useActionState, useMemo, useState } from "react";
import { emailLoginsAction, examLoginTargetsAction, importCandidatesAction, resetAndEmailAction, type ImportCandidatesState } from "@/app/actions/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Notice, Pill } from "@/components/ui-app";
import { fill, type Dictionary } from "@/lib/i18n";

type Row = ImportCandidatesState["rows"][number];
type Delivery = Record<string, { ok: boolean; error?: string }>;

const BATCH = 25;
const MAX_ROWS = 200;

async function download(format: "pdf" | "xlsx", rows: Row[], examId: string) {
  const response = await fetch("/api/credentials/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, examId, rows: rows.map((row) => ({ userId: row.userId, password: row.password, status: row.status })) }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || `logins.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function rowError(dict: Dictionary, code?: string) {
  if (!code) return "";
  const creds = dict.creds as Record<string, string>;
  return creds[code] || dict.errors[code as keyof typeof dict.errors] || code;
}

export function CredentialResults({ dict, rows, examId, initialDelivery = {} }: { dict: Dictionary; rows: Row[]; examId: string; initialDelivery?: Delivery }) {
  const [delivery, setDelivery] = useState<Delivery>(initialDelivery);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const usable = rows.filter((row) => row.userId);
  const withPassword = usable.filter((row) => row.password);
  const count = (status: Row["status"]) => rows.filter((row) => row.status === status).length;

  async function emailAll() {
    const targets = withPassword.filter((row) => !delivery[row.userId]?.ok);
    if (!targets.length) {
      setMessage(dict.creds.nothingToSend);
      return;
    }
    setBusy("email");
    setMessage("");
    let done = 0;
    const next: Delivery = { ...delivery };
    let queue = targets.map((row) => ({ userId: row.userId, password: row.password as string }));
    try {
      let guard = 0;
      while (queue.length && guard < 100) {
        guard += 1;
        const batch = queue.slice(0, BATCH);
        setProgress(fill(dict.creds.emailing, { done, total: targets.length }));
        const result = await emailLoginsAction(batch, examId);
        for (const item of result.results) next[item.userId] = { ok: item.ok, error: item.error };
        done += result.results.length;
        const pending = new Set(result.pending);
        queue = [...batch.filter((item) => pending.has(item.userId)), ...queue.slice(BATCH)];
        setDelivery({ ...next });
      }
    } catch {
      setMessage(dict.errors.generic);
    }
    const ok = targets.filter((row) => next[row.userId]?.ok).length;
    setProgress("");
    setMessage(fill(dict.creds.emailDone, { ok, failed: targets.length - ok }));
    setBusy("");
  }

  async function save(format: "pdf" | "xlsx") {
    setBusy(format);
    try {
      await download(format, usable, examId);
    } catch {
      setMessage(dict.errors.generic);
    }
    setBusy("");
  }

  return (
    <section className="mt-6 grid gap-4">
      <Notice text={fill(dict.creds.summary, { created: count("created") + count("reset"), existing: count("existing"), errors: count("error") })} />
      {withPassword.length ? <p className="max-w-3xl rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{dict.creds.keepNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" disabled={!!busy || !withPassword.length} onClick={emailAll}>{busy === "email" ? progress || dict.creds.downloading : dict.creds.emailLogins}</Button>
        <Button type="button" variant="outline" className="h-10" disabled={!!busy || !usable.length} onClick={() => save("pdf")}>{busy === "pdf" ? dict.creds.downloading : dict.creds.slips}</Button>
        <Button type="button" variant="outline" className="h-10" disabled={!!busy || !usable.length} onClick={() => save("xlsx")}>{busy === "xlsx" ? dict.creds.downloading : dict.creds.excel}</Button>
      </div>
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[720px] text-left text-sm" data-testid="credential-results">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{dict.creds.colName}</th>
              <th className="px-3 py-2">{dict.creds.colEmail}</th>
              <th className="px-3 py-2">{dict.creds.colNumber}</th>
              <th className="px-3 py-2">{dict.creds.colStatus}</th>
              <th className="px-3 py-2">{dict.creds.colPassword}</th>
              <th className="px-3 py-2">{dict.creds.colEmail2}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sent = row.userId ? delivery[row.userId] : undefined;
              return (
                <tr key={`${row.line}-${row.email}`} className="border-t border-foreground/10" data-status={row.status}>
                  <td className="px-3 py-2 text-muted-foreground">{row.line}</td>
                  <td className="px-3 py-2">{row.fullName || "—"}</td>
                  <td className="px-3 py-2">{row.email || "—"}</td>
                  <td className="px-3 py-2">{row.candidateNumber || "—"}</td>
                  <td className="px-3 py-2">
                    {row.status === "error" ? (
                      <span><Pill tone="bad">{dict.creds.error}</Pill><span className="mt-1 block text-xs text-muted-foreground">{rowError(dict, row.error)}</span></span>
                    ) : (
                      <Pill tone={row.status === "existing" ? "neutral" : "good"}>{dict.creds[row.status]}</Pill>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono" data-password>{row.password || (row.status === "existing" ? dict.creds.unchanged : "")}</td>
                  <td className="px-3 py-2">{sent ? <Pill tone={sent.ok ? "good" : "bad"}>{sent.ok ? dict.creds.emailed : `${dict.creds.emailFailed}${sent.error ? `: ${rowError(dict, sent.error)}` : ""}`}</Pill> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Option = { id: string; name: string; organizationId: string };

export function CandidateImport({
  dict,
  organizations,
  groups,
  exams,
  defaultOrganizationId,
  defaultExamId,
  showOrganization,
}: {
  dict: Dictionary;
  organizations: { id: string; name: string }[];
  groups: Option[];
  exams: Option[];
  defaultOrganizationId: string;
  defaultExamId: string;
  showOrganization: boolean;
}) {
  const [state, action, pending] = useActionState(importCandidatesAction, { error: "", rows: [], examId: "" });
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);
  const orgGroups = useMemo(() => groups.filter((group) => group.organizationId === organizationId), [groups, organizationId]);
  const orgExams = useMemo(() => exams.filter((exam) => exam.organizationId === organizationId), [exams, organizationId]);
  const error = state.error === "too_many" ? fill(dict.creds.tooMany, { max: MAX_ROWS }) : state.error === "bad_exam" ? dict.creds.badExam : state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : "";
  return (
    <div>
      <form action={action} className="grid max-w-xl gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <Notice error text={error} />
        {showOrganization ? (
          <Field label={dict.auth.organization}>
            <NativeSelect name="organizationId" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </NativeSelect>
          </Field>
        ) : <input type="hidden" name="organizationId" value={organizationId} />}
        <Field label={dict.creds.file}><Input name="file" type="file" accept=".csv,.xlsx,text/csv" required className="h-11" /></Field>
        <Field label={dict.creds.group}>
          <NativeSelect name="groupId" defaultValue="">
            <option value="">{dict.creds.noGroup}</option>
            {orgGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label={dict.creds.newGroup}><Input name="newGroupName" maxLength={120} className="h-11" /></Field>
        <Field label={dict.creds.exam}>
          <NativeSelect name="examId" defaultValue={orgExams.some((exam) => exam.id === defaultExamId) ? defaultExamId : ""} key={organizationId}>
            <option value="">{dict.creds.noExam}</option>
            {orgExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="resetExisting" /> {dict.creds.resetExisting}</label>
        <Button type="submit" className="h-11 w-fit" disabled={pending}>{pending ? dict.creds.importing : dict.creds.import}</Button>
      </form>
      {state.rows.length ? <CredentialResults key={state.rows.map((row) => row.userId + row.status).join("|")} dict={dict} rows={state.rows} examId={state.examId} /> : null}
    </div>
  );
}

export function ResetLoginButton({ dict, userId, email }: { dict: Dictionary; userId: string; email: string }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "busy">("idle");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  async function run() {
    setStage("busy");
    try {
      const result = await resetAndEmailAction([userId], "");
      const row = result.rows[0];
      const sent = result.results[0];
      if (!row) setMessage({ error: true, text: dict.errors.forbidden });
      else if (sent?.ok) setMessage({ error: false, text: fill(dict.creds.resetDone, { email }) });
      else setMessage({ error: true, text: fill(dict.creds.resetEmailFailed, { error: sent?.error || "?", password: row.password || "" }) });
    } catch {
      setMessage({ error: true, text: dict.errors.generic });
    }
    setStage("idle");
  }
  return (
    <span className="grid justify-items-end gap-1">
      {stage === "confirm" ? (
        <span className="flex gap-2">
          <Button type="button" className="h-8" onClick={run}>{dict.creds.confirm}</Button>
          <Button type="button" variant="outline" className="h-8" onClick={() => setStage("idle")}>{dict.creds.cancel}</Button>
        </span>
      ) : (
        <Button type="button" variant="outline" className="h-8" disabled={stage === "busy"} onClick={() => setStage("confirm")}>{stage === "busy" ? dict.creds.downloading : dict.creds.resetAndEmail}</Button>
      )}
      {message ? <span className={`max-w-sm text-right text-xs ${message.error ? "text-destructive" : "text-muted-foreground"}`} role="status">{message.text}</span> : null}
    </span>
  );
}

export function SendExamLogins({ dict, examId, assignedCount }: { dict: Dictionary; examId: string; assignedCount: number }) {
  const [stage, setStage] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [delivery, setDelivery] = useState<Delivery>({});
  const [error, setError] = useState("");
  async function run() {
    setStage("busy");
    setError("");
    try {
      const ids = await examLoginTargetsAction(examId);
      if (!ids.length) {
        setError(dict.creds.noneAssigned);
        setStage("idle");
        return;
      }
      const all: Row[] = [];
      const sent: Delivery = {};
      let queue = [...ids];
      let guard = 0;
      while (queue.length && guard < 100) {
        guard += 1;
        const batch = queue.slice(0, BATCH);
        setProgress(fill(dict.creds.emailing, { done: all.length, total: ids.length }));
        const result = await resetAndEmailAction(batch, examId);
        if (result.error) throw new Error(result.error);
        for (const row of result.rows) all.push({ ...row, line: all.length + 1 });
        for (const item of result.results) sent[item.userId] = { ok: item.ok, error: item.error };
        const pending = new Set(result.pending);
        const handled = new Set(result.rows.map((row) => row.userId));
        // Ids neither handled nor pending are not manageable; drop them.
        queue = [...batch.filter((id) => pending.has(id) && !handled.has(id)), ...queue.slice(BATCH)];
        setRows([...all]);
        setDelivery({ ...sent });
      }
      setStage("done");
    } catch {
      setError(dict.errors.generic);
      setStage("done");
    }
    setProgress("");
  }
  return (
    <div className="grid gap-3">
      <p className="max-w-2xl text-sm text-muted-foreground">{dict.creds.sendAllLead}</p>
      {stage === "confirm" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span>{fill(dict.creds.confirmSendAll, { n: assignedCount })}</span>
          <Button type="button" className="h-9" onClick={run}>{dict.creds.confirm}</Button>
          <Button type="button" variant="outline" className="h-9" onClick={() => setStage("idle")}>{dict.creds.cancel}</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-10 w-fit" disabled={stage === "busy" || assignedCount === 0} onClick={() => setStage("confirm")}>
          {stage === "busy" ? progress || dict.creds.downloading : dict.creds.sendAll}
        </Button>
      )}
      {assignedCount === 0 ? <p className="text-sm text-muted-foreground">{dict.creds.noneAssigned}</p> : null}
      {error ? <Notice error text={error} /> : null}
      {rows.length && stage !== "busy" ? <CredentialResults key={rows.length} dict={dict} rows={rows} examId={examId} initialDelivery={delivery} /> : null}
    </div>
  );
}
