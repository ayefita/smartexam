"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/ui-app";

export type Sitting = {
  id: string;
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
}: {
  examId: string;
  initial: Sitting[];
  labels: { online: string; away: string; done: string; progress: string; left: string; risk: string; low: string; medium: string; high: string; empty: string; gaps: string };
}) {
  const [rows, setRows] = useState(initial);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/exams/${examId}/live`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!stop && Array.isArray(body.sitting)) setRows(body.sitting);
      } catch {
        // Keep the last board on a dropped poll.
      }
    };
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [examId]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2">{labels.online}</th>
            <th className="px-3 py-2">{labels.progress}</th>
            <th className="px-3 py-2">{labels.left}</th>
            <th className="px-3 py-2">{labels.gaps}</th>
            <th className="px-3 py-2">{labels.risk}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const level = band(row.risk);
            const presence = row.status === "submitted" ? labels.done : row.online ? labels.online : labels.away;
            const tone = row.status === "submitted" ? "neutral" : row.online ? "good" : "bad";
            return (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <div className="font-medium">{row.name}</div>
                  <Pill tone={tone}>{presence}</Pill>
                </td>
                <td className="px-3 py-3">{row.answered}/{row.total}</td>
                <td className="px-3 py-3">{row.status === "in_progress" ? clock(row.secondsLeft) : "—"}</td>
                <td className="px-3 py-3">{row.disconnects}</td>
                <td className="px-3 py-3">
                  <Pill tone={level === "high" ? "bad" : level === "medium" ? "wait" : "good"}>{row.risk} · {labels[level]}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
