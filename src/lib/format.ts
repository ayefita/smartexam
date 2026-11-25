import { randomBytes } from "crypto";

export function iso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function num(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function bool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

export function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function answersMatch(given: string, accepted: string) {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(accepted);
  if (a && a === b) return true;
  const na = Number(given.replace(/,/g, "").trim());
  const nb = Number(accepted.replace(/,/g, "").trim());
  return Boolean(given.trim() && accepted.trim() && Number.isFinite(na) && Number.isFinite(nb) && na === nb);
}

const ADDIS = "+03:00";

export function fromAddisInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value.length === 16 ? value : value.slice(0, 16)}:00${ADDIS}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function toAddisInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export function formatAddis(value: string | null, locale: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const loc = locale === "am" ? "am-ET" : locale === "om" ? "om-ET" : "en-GB";
  return new Intl.DateTimeFormat(loc, {
    timeZone: "Africa/Addis_Ababa",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function cleanMedia(url: string, kind: string): { url: string; kind: string; error?: string } {
  const u = url.trim();
  if (!u) return { url: "", kind: "" };
  const k = kind === "audio" ? "audio" : "image";
  if (u.startsWith("data:image/") && k === "image") {
    if (u.length > 500_000) return { url: "", kind: "", error: "media_large" };
    return { url: u, kind: "image" };
  }
  if (u.startsWith("data:audio/") && k === "audio") {
    if (u.length > 700_000) return { url: "", kind: "", error: "media_large" };
    return { url: u, kind: "audio" };
  }
  if (/^https?:\/\//i.test(u) && u.length < 2000) return { url: u, kind: k };
  return { url: "", kind: "", error: "media_url" };
}

export function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:43219").replace(/\/$/, "");
}

export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}
