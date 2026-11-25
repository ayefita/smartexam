"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Shows a short message after an action (for example after saving), once per page load. */
export function Flash({ text, error = false, scrollTop = false }: { text?: string; error?: boolean; scrollTop?: boolean }) {
  const shown = useRef("");
  useEffect(() => {
    if (!text || shown.current === text) return;
    shown.current = text;
    if (scrollTop && !window.location.hash) window.scrollTo({ top: 0 });
    if (error) toast.error(text);
    else toast.success(text);
  }, [text, error, scrollTop]);
  return null;
}
