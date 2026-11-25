"use client";

import { useEffect, useState } from "react";
import { fill, type Dictionary } from "@/lib/i18n";

/** "Opens in 2 d 4 h" style countdown; reloads the page when the time arrives. */
export function Countdown({ dict, to }: { dict: Dictionary; to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= target) {
        window.clearInterval(timer);
        window.location.reload();
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (now == null) return null;
  const left = Math.max(0, target - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.max(1, Math.ceil((left % 3_600_000) / 60_000));
  const s = dict.ux.student;
  const time = d > 0 ? fill(s.d, { d, h }) : h > 0 ? fill(s.h, { h, m }) : fill(s.m, { m });
  return <span>{fill(s.opensIn, { time })}</span>;
}
