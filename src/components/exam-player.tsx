"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fill, type Dictionary } from "@/lib/i18n";
import { formatClock } from "@/lib/format";
import type { PresentedQuestion } from "@/lib/types";

type Saved = { selected: string[]; text: string; matching: Record<string, string>; flagged: boolean; updatedAt?: string };

export function ExamPlayer({
  dict,
  attemptId,
  title,
  deadlineAt,
  serverNow,
  proctorWebcam,
  proctorFullscreen,
  questions,
  initialAnswers,
  blockCopy = false,
  tabLimit = 0,
  tabSwitchCount = 0,
}: {
  dict: Dictionary;
  attemptId: string;
  title: string;
  deadlineAt: string;
  serverNow: string;
  proctorWebcam: boolean;
  proctorFullscreen: boolean;
  questions: PresentedQuestion[];
  initialAnswers: Record<string, Saved>;
  blockCopy?: boolean;
  tabLimit?: number;
  tabSwitchCount?: number;
}) {
  const router = useRouter();
  const storageKey = `smartexam-answers-${attemptId}`;
  const tabKey = `smartexam-tab-${attemptId}`;
  const [tabId, setTabId] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Saved>>(initialAnswers);
  // saved: the server has everything. saving: a save is on its way. offline: kept on this device, will retry.
  const [sync, setSync] = useState<"saved" | "saving" | "offline">("saved");
  const [deadline, setDeadline] = useState(deadlineAt);
  const [tabs, setTabs] = useState(tabSwitchCount);
  const [view, setView] = useState({ zoom: 1, contrast: false });
  const [left, setLeft] = useState(0);
  const [warnTab, setWarnTab] = useState(false);
  const [warnFs, setWarnFs] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [cameraFail, setCameraFail] = useState(false);
  const [offline, setOffline] = useState(false);
  const offset = useRef(new Date(serverNow).getTime() - Date.now());
  const answersRef = useRef(answers);
  const videoRef = useRef<HTMLVideoElement>(null);
  const submitting = useRef(false);
  // Questions changed on this device but not yet confirmed by the server, with a change counter each.
  const dirty = useRef<Map<string, number>>(new Map());
  const inflight = useRef(false);
  const failures = useRef(0);
  const flushTimer = useRef(0);
  const world = dict.world;
  answersRef.current = answers;
  const question = questions[index];

  useEffect(() => {
    let id = sessionStorage.getItem(tabKey);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(tabKey, id);
    }
    setTabId(id);
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const local = JSON.parse(raw) as { answers: Record<string, Saved>; at: number; pending?: string[] };
        for (const key of local.pending || []) dirty.current.set(key, (dirty.current.get(key) || 0) + 1);
        setAnswers((current) => {
          const next = { ...current };
          for (const [key, value] of Object.entries(local.answers || {})) {
            const serverAt = current[key]?.updatedAt ? new Date(current[key].updatedAt!).getTime() : 0;
            if ((local.at || 0) >= serverAt) next[key] = { ...current[key], ...value };
          }
          return next;
        });
      } catch {
        // Ignore a damaged local copy.
      }
    }
    try {
      const prefs = JSON.parse(localStorage.getItem("smartexam-view") || "{}") as { zoom?: number; contrast?: boolean };
      setView({ zoom: Math.min(1.6, Math.max(1, Number(prefs.zoom) || 1)), contrast: Boolean(prefs.contrast) });
    } catch {
      // Default view.
    }
    void claim(id, false);
  }, [attemptId, router, storageKey, tabKey]);

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(deadline).getTime() - (Date.now() + offset.current);
      setLeft(remaining);
      if (remaining <= 0) void submit("timer");
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      void flush();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Only retries what is still waiting; a student with nothing unsaved sends nothing here.
    const id = window.setInterval(() => {
      if (dirty.current.size && !inflight.current) void flush();
    }, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(id);
    };
  }, [tabId]);

  useEffect(() => {
    if (!tabId || blocked) return;
    const beat = async () => {
      try {
        const response = await fetch(`/api/attempts/${attemptId}/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId }),
        });
        const body = await response.json();
        if (body?.error === "other_session") setBlocked(true);
        if (body?.error === "already_submitted") router.push(`/results/${attemptId}`);
        if (body?.ok) {
          setOffline(false);
          if (body.serverNow) offset.current = new Date(body.serverNow).getTime() - Date.now();
          if (body.deadlineAt) setDeadline((value) => (value === body.deadlineAt ? value : body.deadlineAt));
        }
      } catch {
        setOffline(true);
      }
    };
    void beat();
    const id = window.setInterval(() => void beat(), 15000);
    return () => window.clearInterval(id);
  }, [attemptId, blocked, tabId]);

  useEffect(() => {
    if (!proctorFullscreen || blocked) return;
    const onChange = () => {
      if (!document.fullscreenElement) {
        setWarnFs(true);
        void postProctor("fullscreen_exit");
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [blocked, proctorFullscreen, tabId]);

  useEffect(() => {
    if (blocked) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        setWarnTab(true);
        void flush();
        void postProctor("tab_switch").then((body) => {
          if (typeof body?.tabSwitches === "number") setTabs(body.tabSwitches);
          if (body?.autoSubmitted) router.push(`/results/${attemptId}`);
        });
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (blockCopy) event.preventDefault();
      void postProctor("paste");
    };
    const onCopy = (event: Event) => {
      if (!blockCopy) return;
      event.preventDefault();
      void postProctor("copy_blocked");
    };
    const onMenu = (event: Event) => {
      if (blockCopy) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onMenu);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onMenu);
    };
  }, [blocked, tabId, blockCopy]);

  useEffect(() => {
    if (!proctorWebcam || blocked || !tabId) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 } })
      .then((media) => {
        stream = media;
        if (videoRef.current) videoRef.current.srcObject = media;
        timer = window.setInterval(() => void snap("camera_snapshot"), 60000);
        void snap("camera_snapshot");
      })
      .catch(() => {
        setCameraFail(true);
        void postProctor("camera_denied");
      });
    return () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [blocked, proctorWebcam, tabId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (event.key === "ArrowRight") setIndex((value) => Math.min(questions.length - 1, value + 1));
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      if (event.key.toLowerCase() === "f") toggleFlag();
      if (/^[1-9]$/.test(event.key)) choose(Number(event.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function current(id = question?.id) {
    return answersRef.current[id] || { selected: [], text: "", matching: {}, flagged: false };
  }

  function persist(next: Record<string, Saved>) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers: next, at: Date.now(), pending: [...dirty.current.keys()] }));
    } catch {
      // Storage full or blocked: the server copy still works.
    }
  }

  async function claim(id: string, takeover: boolean) {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: id, takeover }),
      });
      const body = await response.json();
      if (body?.error === "other_session") setBlocked(true);
      if (body?.error === "already_submitted") router.push(`/results/${attemptId}`);
      if (body?.ok) {
        setBlocked(false);
        if (dirty.current.size) void flush(id);
      }
    } catch {
      setOffline(true);
      if (dirty.current.size) setSync("offline");
    }
  }

  function update(patch: Partial<Saved>) {
    if (!question) return;
    const next = { ...answersRef.current, [question.id]: { ...current(), ...patch } };
    dirty.current.set(question.id, (dirty.current.get(question.id) || 0) + 1);
    answersRef.current = next;
    setAnswers(next);
    persist(next);
    setSync(navigator.onLine ? "saving" : "offline");
    window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => void flush(), 600);
  }

  /** Sends every unsaved answer in one request. Returns true when nothing is left waiting. */
  async function flush(id = tabId): Promise<boolean> {
    if (!id || inflight.current) return dirty.current.size === 0;
    if (!dirty.current.size) {
      setSync("saved");
      return true;
    }
    inflight.current = true;
    const batch = new Map(dirty.current);
    const payload = [...batch.keys()].map((questionId) => {
      const answer = answersRef.current[questionId] || current(questionId);
      return { questionId, selected: answer.selected, text: answer.text, matching: answer.matching, flagged: answer.flagged };
    });
    setSync("saving");
    try {
      const response = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: id, answers: payload }),
      });
      const body = await response.json();
      if (body?.error === "expired" || body?.error === "already_submitted") {
        router.push(`/results/${attemptId}`);
        return true;
      }
      if (body?.error === "other_session") {
        setBlocked(true);
        return false;
      }
      if (!response.ok || !body?.ok) throw new Error("save");
      // Drop only answers that did not change again while this request was on its way.
      for (const [questionId, version] of batch) {
        if (dirty.current.get(questionId) === version) dirty.current.delete(questionId);
      }
      persist(answersRef.current);
      failures.current = 0;
      setOffline(false);
      setSync(dirty.current.size ? "saving" : "saved");
      if (dirty.current.size) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = window.setTimeout(() => void flush(), 300);
      }
      return dirty.current.size === 0;
    } catch {
      failures.current += 1;
      setSync("offline");
      setOffline(!navigator.onLine || failures.current > 1);
      // Back off gently (2s, 4s, 8s... up to 30s) so 400 phones do not hammer a busy server.
      const wait = Math.min(30_000, 1000 * 2 ** Math.min(failures.current, 5)) + Math.random() * 1000;
      window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => void flush(), wait);
      return false;
    } finally {
      inflight.current = false;
    }
  }

  async function postProctor(kind: string, snapshot = ""): Promise<{ tabSwitches?: number; autoSubmitted?: boolean } | null> {
    if (!tabId) return null;
    try {
      const response = await fetch(`/api/attempts/${attemptId}/proctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId, kind, snapshot }),
      });
      return await response.json();
    } catch {
      // A missed proctor ping should not block the exam.
      return null;
    }
  }

  async function snap(kind: string) {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 240);
    const data = canvas.toDataURL("image/jpeg", 0.55);
    if (data.length < 150000) await postProctor(kind, data);
  }

  function choose(optionIndex: number) {
    if (!question || question.type === "short" || question.type === "blank" || question.type === "essay" || question.type === "matching") return;
    const option = question.options[optionIndex];
    if (!option) return;
    if (question.type === "multiple") {
      const selected = new Set(current().selected);
      if (selected.has(option.id)) selected.delete(option.id);
      else selected.add(option.id);
      update({ selected: [...selected] });
      return;
    }
    update({ selected: [option.id] });
  }

  function toggleFlag() {
    if (!question) return;
    update({ flagged: !current().flagged });
  }

  async function submit(reason: "manual" | "timer") {
    if (submitting.current) return;
    submitting.current = true;
    setConfirm(false);
    // Try a few times to get every answer to the server before handing in.
    for (let tries = 0; tries < 4; tries += 1) {
      while (inflight.current) await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (await flush()) break;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    try {
      await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId, reason }),
      });
    } catch {
      // The server also submits when the deadline passes.
    }
    router.push(`/results/${attemptId}`);
  }

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      setWarnFs(false);
    } catch {
      await postProctor("fullscreen_denied");
    }
  }

  const syncLabel = sync === "saved" ? world.saved : sync === "saving" ? world.saving : world.offlineRetry;
  const changeView = (patch: Partial<typeof view>) => {
    const next = { ...view, ...patch };
    setView(next);
    localStorage.setItem("smartexam-view", JSON.stringify(next));
  };
  const low = left < 5 * 60 * 1000;
  const optionName = useMemo(() => `q-${question?.id}`, [question?.id]);
  if (blocked) {
    return (
      <div className="mx-auto grid max-w-lg gap-3 rounded-xl bg-card p-6 text-sm ring-1 ring-foreground/10" role="alert">
        <p>{dict.player.blocked}</p>
        <p className="text-muted-foreground">{world.takeoverHint}</p>
        <Button type="button" className="h-11 w-fit" onClick={() => void claim(tabId, true)}>{world.takeover}</Button>
      </div>
    );
  }
  if (!question) return null;
  const answer = current();
  const isAnswered = (id: string) => {
    const state = answers[id];
    return !!state && (state.selected.length > 0 || !!state.text.trim() || Object.values(state.matching || {}).some(Boolean));
  };
  const unansweredNos = questions.map((item, itemIndex) => (isAnswered(item.id) ? 0 : itemIndex + 1)).filter(Boolean);
  const flaggedNos = questions.map((item, itemIndex) => (answers[item.id]?.flagged ? itemIndex + 1 : 0)).filter(Boolean);
  const ux = dict.ux.player;
  const jump = (n: number) => {
    setConfirm(false);
    setIndex(n - 1);
  };

  return (
    <div
      className={`mx-auto grid w-full min-w-0 max-w-5xl gap-4 ${view.contrast ? "exam-contrast" : ""} ${blockCopy ? "select-none" : ""}`}
      style={view.zoom !== 1 ? ({ zoom: view.zoom } as CSSProperties) : undefined}
    >
      <div className="sticky top-16 z-20 flex min-w-0 flex-nowrap items-center justify-between gap-3 border-b border-border bg-background/95 py-2 backdrop-blur md:static md:border-0 md:bg-transparent md:py-0">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{fill(dict.player.question, { n: index + 1, total: questions.length })}</p>
          <h1 className="truncate font-heading text-lg font-semibold md:text-2xl">{title}</h1>
        </div>
        <div className={`shrink-0 rounded-xl px-3 py-1.5 text-center md:py-2 ${low ? "bg-[#fde8ec] text-[#8e1e32]" : "bg-primary text-primary-foreground"}`} role="timer" aria-label={dict.player.time}>
          <p className="text-[11px] uppercase tracking-wide">{ux.timeLeft}</p>
          <p className="font-heading text-xl tabular-nums md:text-2xl">{formatClock(left)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${sync === "saved" ? "bg-[#e5f6ee] text-[#0c5c40]" : sync === "saving" ? "bg-muted text-foreground" : "bg-[#f8efd4] text-[#6b5420]"}`}
          role="status"
          aria-live="polite"
          data-sync={sync}
        >
          <span className={`size-2 rounded-full ${sync === "saved" ? "bg-[#0c7a52]" : sync === "saving" ? "animate-pulse bg-foreground/60" : "bg-[#b8860b]"}`} aria-hidden />
          {syncLabel}
        </p>
        <div className="flex items-center gap-1" role="group" aria-label={world.view}>
          <Button type="button" variant="outline" className="h-9 min-w-9 px-2" aria-label={world.smaller} disabled={view.zoom <= 1} onClick={() => changeView({ zoom: Math.max(1, Math.round((view.zoom - 0.15) * 100) / 100) })}>A−</Button>
          <Button type="button" variant="outline" className="h-9 min-w-9 px-2 text-base" aria-label={world.bigger} disabled={view.zoom >= 1.6} onClick={() => changeView({ zoom: Math.min(1.6, Math.round((view.zoom + 0.15) * 100) / 100) })}>A+</Button>
          <Button type="button" variant="outline" className="h-9 px-2" aria-pressed={view.contrast} onClick={() => changeView({ contrast: !view.contrast })}>{world.contrast}</Button>
        </div>
      </div>
      {offline ? <p className="rounded-lg bg-[#f8efd4] px-3 py-2 text-sm text-[#6b5420]" role="status">{world.offlineHelp}</p> : null}
      {cameraFail ? <p className="rounded-lg bg-[#f8efd4] px-3 py-2 text-sm text-[#6b5420]" role="status">{dict.player.cameraFail}</p> : null}
      {warnTab ? (
        <p className="rounded-lg bg-[#fde8ec] px-3 py-2 text-sm text-[#8e1e32]" role="status">
          {dict.player.tabWarn}
          {tabLimit > 0 ? ` ${fill(world.tabCount, { n: tabs, max: tabLimit })}` : ""}
        </p>
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:p-6">
          <p className="text-sm text-muted-foreground">{fill(dict.player.question, { n: index + 1, total: questions.length })} · {question.points} {dict.common.points}</p>
          {question.mediaUrl && question.mediaKind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.mediaUrl} alt={question.mediaAlt || ""} className="mt-3 max-h-64 rounded-lg border border-border" />
          ) : null}
          {question.mediaUrl && question.mediaKind === "audio" ? <audio className="mt-3 w-full" controls src={question.mediaUrl} aria-label={question.mediaAlt || dict.questions.media} /> : null}
          <h2 className="mt-3 whitespace-pre-wrap font-heading text-xl leading-snug">{question.stem}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {question.type === "multiple" ? dict.player.multiple : question.type === "short" ? dict.player.short : question.type === "blank" ? dict.player.blank : question.type === "essay" ? dict.player.essay : question.type === "matching" ? dict.player.match : null}
          </p>
          {question.type === "single" || question.type === "multiple" || question.type === "true_false" ? (
            <div role={question.type === "multiple" ? "group" : "radiogroup"} aria-label={question.stem} className="mt-4 grid gap-2">
              {question.options.map((option, optionIndex) => {
                const selected = answer.selected.includes(option.id);
                const label = question.type === "true_false" ? (option.id === "true" ? dict.player.true : dict.player.false) : option.text;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role={question.type === "multiple" ? "checkbox" : "radio"}
                    aria-checked={selected}
                    name={optionName}
                    onClick={() => choose(optionIndex)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                  >
                    <span className="grid size-6 place-items-center rounded-full border border-current text-xs">{optionIndex + 1}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {question.type === "short" || question.type === "blank" || question.type === "essay" ? (
            <Textarea className="mt-4 min-h-28 text-base" value={answer.text} aria-label={question.stem} onChange={(event) => update({ text: event.target.value })} />
          ) : null}
          {question.type === "matching" ? (
            <div className="mt-4 grid gap-3">
              {question.left.map((item) => (
                <label key={item.id} className="grid gap-1 text-sm">
                  {item.text}
                  <select
                    className="h-11 rounded-lg border border-input bg-card px-3"
                    value={answer.matching[item.id] || ""}
                    onChange={(event) => update({ matching: { ...answer.matching, [item.id]: event.target.value } })}
                  >
                    <option value="">{dict.common.all}</option>
                    {question.right.map((right) => (
                      <option key={right.id} value={right.id}>{right.text}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => setIndex((value) => Math.max(0, value - 1))}>{dict.player.prev}</Button>
            <Button type="button" variant="outline" className="h-11" onClick={toggleFlag} aria-pressed={answer.flagged}>{answer.flagged ? dict.player.unflag : dict.player.flag}</Button>
            {index < questions.length - 1 ? (
              <Button type="button" className="h-11" onClick={() => setIndex((value) => value + 1)}>{dict.player.next}</Button>
            ) : (
              <Button type="button" className="h-11" onClick={() => setConfirm(true)}>{ux.review}</Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{dict.player.keys}</p>
        </article>
        <aside className="rounded-2xl bg-card p-3 ring-1 ring-foreground/10">
          <h2 className="px-1 text-sm font-medium">{dict.player.navigator}</h2>
          <div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5" role="navigation" aria-label={dict.player.navigator}>
            {questions.map((item, itemIndex) => {
              const state = answers[item.id];
              const answered = isAnswered(item.id);
              const status = [answered ? ux.answered : ux.empty, state?.flagged ? ux.flagged : ""].filter(Boolean).join(", ");
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={itemIndex === index ? "true" : undefined}
                  aria-label={`${fill(dict.player.question, { n: itemIndex + 1, total: questions.length })}: ${status}`}
                  onClick={() => setIndex(itemIndex)}
                  className={`relative h-11 rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${itemIndex === index ? "bg-primary text-primary-foreground" : answered ? "bg-[#e5f6ee] text-[#0c5c40]" : "bg-muted"} ${state?.flagged ? "ring-2 ring-[#b8860b]" : ""}`}
                >
                  {itemIndex + 1}
                  {state?.flagged ? <span className="absolute right-1 top-1 size-2 rounded-full bg-[#b8860b]" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          <ul className="mt-3 grid gap-1 text-xs text-muted-foreground" aria-hidden>
            <li className="flex items-center gap-2"><span className="size-3 rounded bg-[#e5f6ee] ring-1 ring-[#0c5c40]/30" />{ux.answered}</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded bg-muted ring-1 ring-foreground/20" />{ux.empty}</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded ring-2 ring-[#b8860b]" />{ux.flagged}</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded bg-primary" />{ux.current}</li>
          </ul>
          <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={() => setConfirm(true)}>{ux.review}</Button>
          {proctorWebcam ? (
            <video ref={videoRef} autoPlay muted playsInline aria-label={dict.player.camera} className="mt-4 aspect-video w-full rounded-lg bg-black object-cover" />
          ) : null}
        </aside>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ux.reviewTitle}</DialogTitle>
            <DialogDescription>{fill(ux.summary, { a: questions.length - unansweredNos.length, u: unansweredNos.length, f: flaggedNos.length })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            {unansweredNos.length === 0 ? <p className="rounded-lg bg-[#e5f6ee] p-3 text-[#0c5c40]">{ux.allAnswered}</p> : (
              <div>
                <p className="font-medium">{ux.unanswered}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {unansweredNos.map((n) => <Button key={n} type="button" variant="outline" className="h-10 min-w-10" aria-label={fill(ux.goTo, { n })} onClick={() => jump(n)}>{n}</Button>)}
                </div>
              </div>
            )}
            {flaggedNos.length ? (
              <div>
                <p className="font-medium">{ux.flaggedList}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {flaggedNos.map((n) => <Button key={n} type="button" variant="outline" className="h-10 min-w-10 ring-2 ring-[#b8860b]" aria-label={fill(ux.goTo, { n })} onClick={() => jump(n)}>{n}</Button>)}
                </div>
              </div>
            ) : null}
            <p className="text-muted-foreground">{dict.player.confirm}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConfirm(false)}>{ux.back}</Button>
            <Button type="button" className="h-11" onClick={() => void submit("manual")}>{ux.submit}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={warnFs} onOpenChange={setWarnFs}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.player.returnFs}</DialogTitle>
            <DialogDescription>{dict.player.fsWarn}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => void enterFullscreen()}>{dict.player.returnFs}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
