import { query } from "./db";
import { num } from "./format";

export function bandRisk(score: number): "low" | "medium" | "high" {
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function scoreRisk(counts: Record<string, number>) {
  const tab = counts.tab_switch || 0;
  const fullscreen = counts.fullscreen_exit || 0;
  const camera = counts.camera_denied || 0;
  const paste = counts.paste || 0;
  const disconnect = counts.disconnect || 0;
  const blur = counts.blur || 0;
  const raw =
    Math.min(40, tab * 12) +
    Math.min(20, fullscreen * 10) +
    Math.min(15, camera * 15) +
    Math.min(15, paste * 5) +
    Math.min(24, disconnect * 8) +
    Math.min(12, blur * 4);
  return Math.max(0, Math.min(100, raw));
}

export async function refreshRisk(attemptId: string) {
  const rows = await query<{ kind: string; n: number }>(
    `select kind, count(*)::int as n from proctor_events where attempt_id = $1 and kind <> 'camera_snapshot' group by kind`,
    [attemptId],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row.kind)] = num(row.n);
  const attempt = await query(`select disconnect_count from attempts where id = $1`, [attemptId]);
  counts.disconnect = Math.max(counts.disconnect || 0, num(attempt[0]?.disconnect_count));
  const risk = scoreRisk(counts);
  await query(`update attempts set risk_score = $2, suspicious_count = $3 where id = $1`, [
    attemptId,
    risk,
    Object.values(counts).reduce((sum, value) => sum + value, 0),
  ]);
  return risk;
}
