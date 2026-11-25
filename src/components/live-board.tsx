"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui-app";
import { fill } from "@/lib/i18n";

export type Sitting = {
  id: string;
  candidateId?: string;
  name: string;
  status: string;
  online: boolean;
  disconnected: boolean;
  answered: number;
  total: number;
  secondsLeft: number;
  disconnects: number;
  risk: number;
  tabSwitches: number;
  extraMinutes?: number;
  percentage?: number | null;
};

type Labels = { online: string; away: string; done: string; progress: string; left: string; risk: string; low: string; medium: string; high: string; empty: string; gaps: string };
export type BoardWords = {
  notStarted: string;
  writing: string;
  student: string;
  tabs: string;
  actions: string;
  addTime: string;
  minutes: string;
  handIn: string;
  handInAsk: string;
  reopen: string;
  reopenAsk: string;
  extraBefore: string;
  save: string;
  timeline: string;
  extraBadge: string;
  done: string;
  failed: string;
  live: string;
};

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function band(score: number): "low" | "medium" | "high" {
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function LiveBoard({
  examId,
  initial,
  labels,
  words,
  tabLimit = 0,
}: {
  examId: string;
  initial: Sitting[];
  labels: Labels;
  words: BoardWords;
  tabLimit?: number;
}) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState("");
  const [minutes, setMinutes] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/exams/${examId}/live`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (Array.isArray(body.sitting)) setRows(body.sitting);
    } catch {
      // Keep the last board on a dropped poll.
    }
  }, [examId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  async function act(key: string, payload: Record<string, unknown>, ask?: string) {
    if (ask && !window.confirm(ask)) return;
    setBusy(key);
    try {
      const response = await fetch(`/api/exams/${examId}/invigilate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (body?.ok) toast.success(words.done);
      else toast.error(words.failed);
      await load();
    } catch {
      toast.error(words.failed);
    } finally {
      setBusy("");
    }
  }

  const counts = {
    waiting: rows.filter((row) => row.status === "not_started").length,
    writing: rows.filter((row) => row.status === "in_progress" && row.online).length,
    away: rows.filter((row) => row.status === "in_progress" && !row.online).length,
    done: rows.filter((row) => row.status === "submitted").length,
  };

  if (!rows.length) return <p className="text-sm text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-[#0c7a52]" aria-hidden />{words.live}</span>
        <Pill tone="neutral">{words.notStarted}: {counts.waiting}</Pill>
        <Pill tone="good">{words.writing}: {counts.writing}</Pill>
        <Pill tone="bad">{labels.away}: {counts.away}</Pill>
        <Pill tone="neutral">{labels.done}: {counts.done}</Pill>
      </div>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2">{words.student}</th>
              <th className="px-3 py-2">{labels.progress}</th>
              <th className="px-3 py-2">{labels.left}</th>
              <th className="px-3 py-2">{words.tabs}</th>
              <th className="px-3 py-2">{labels.gaps}</th>
              <th className="px-3 py-2">{labels.risk}</th>
              <th className="px-3 py-2">{words.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.id || `wait-${row.candidateId}`;
              const level = band(row.risk);
              const waiting = row.status === "not_started";
              const live = row.status === "in_progress";
              const presence = waiting ? words.notStarted : row.status === "submitted" ? labels.done : row.online ? words.writing : labels.away;
              const tone = waiting || row.status === "submitted" ? "neutral" : row.online ? "good" : "bad";
              const near = tabLimit > 0 && row.tabSwitches >= Math.max(1, tabLimit - 1);
              const pick = minutes[key] ?? (waiting ? row.extraMinutes || 15 : 10);
              return (
                <tr key={key} className="border-b align-top last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-medium">{row.name}</div>
                    <Pill tone={tone}>{presence}</Pill>
                    {row.extraMinutes ? <span className="ml-1 text-xs text-muted-foreground">{fill(words.extraBadge, { n: row.extraMinutes })}</span> : null}
                  </td>
                  <td className="px-3 py-3">{waiting ? "—" : `${row.answered}/${row.total}`}{row.status === "submitted" && row.percentage != null ? <span className="block text-xs text-muted-foreground">{row.percentage}%</span> : null}</td>
                  <td className="px-3 py-3 tabular-nums">{live ? clock(row.secondsLeft) : "—"}</td>
                  <td className={`px-3 py-3 ${near ? "font-semibold text-[#8e1e32]" : ""}`}>{waiting ? "—" : tabLimit > 0 ? `${row.tabSwitches} / ${tabLimit}` : row.tabSwitches}</td>
                  <td className="px-3 py-3">{waiting ? "—" : row.disconnects}</td>
                  <td className="px-3 py-3">{waiting ? "—" : <Pill tone={level === "high" ? "bad" : level === "medium" ? "wait" : "good"}>{row.risk} · {labels[level]}</Pill>}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {live || waiting || row.status === "submitted" ? (
                        <label className="sr-only" htmlFor={`min-${key}`}>{fill(words.minutes, { n: "" }).trim()}</label>
                      ) : null}
                      {live || waiting || row.status === "submitted" ? (
                        <select
                          id={`min-${key}`}
                          className="h-9 rounded-md border border-input bg-background px-2"
                          value={pick}
                          onChange={(event) => setMinutes({ ...minutes, [key]: Number(event.target.value) })}
                        >
                          {(waiting ? [0, 5, 10, 15, 20, 30, 45, 60] : [5, 10, 15, 20, 30, 45, 60]).map((n) => <option key={n} value={n}>{fill(words.minutes, { n })}</option>)}
                        </select>
                      ) : null}
                      {live ? (
                        <>
                          <Button type="button" variant="outline" className="h-9" disabled={busy === key} onClick={() => void act(key, { action: "extra_time", attemptId: row.id, minutes: pick })}>{words.addTime}</Button>
                          <Button type="button" variant="outline" className="h-9 text-[#8e1e32]" disabled={busy === key} onClick={() => void act(key, { action: "force_submit", attemptId: row.id }, fill(words.handInAsk, { name: row.name }))}>{words.handIn}</Button>
                        </>
                      ) : null}
                      {row.status === "submitted" ? (
                        <Button type="button" variant="outline" className="h-9" disabled={busy === key} onClick={() => void act(key, { action: "reopen", attemptId: row.id, minutes: pick }, fill(words.reopenAsk, { name: row.name, n: pick }))}>{words.reopen}</Button>
                      ) : null}
                      {waiting ? (
                        <Button type="button" variant="outline" className="h-9" disabled={busy === key} onClick={() => void act(key, { action: "accommodation", candidateId: row.candidateId, minutes: pick })}>{words.extraBefore}</Button>
                      ) : null}
                      {row.id ? <Link href={`/exams/${examId}/monitor/${row.id}`} className="text-sm text-primary underline-offset-4 hover:underline">{words.timeline}</Link> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
