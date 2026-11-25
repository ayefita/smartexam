"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, type Dictionary } from "@/lib/i18n";

export type GuideStep = { title: string; help: string; button: string; href: string; done: boolean; count?: number };

export function SetupGuide({ dict, steps }: { dict: Dictionary; steps: GuideStep[] }) {
  const g = dict.ux.guide;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("smartexam_guide") === "closed") setOpen(false);
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem("smartexam_guide", next ? "open" : "closed");
  }
  const current = steps.findIndex((step) => !step.done);
  const doneCount = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="guide-title" className="rounded-2xl bg-card p-4 ring-2 ring-primary/30 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="guide-title" className="font-heading text-2xl">{g.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{current === -1 ? g.allDone : g.lead}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{doneCount} / {steps.length}</span>
          <Button type="button" variant="ghost" className="h-10 gap-1" aria-expanded={open} aria-controls="guide-steps" onClick={toggle}>
            {open ? g.hide : g.show}
            <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </Button>
        </div>
      </div>
      {open ? (
        <ol id="guide-steps" className="mt-4 grid gap-2">
          {steps.map((step, index) => {
            const isCurrent = index === current;
            return (
              <li key={step.title} className={`flex flex-wrap items-center gap-3 rounded-xl p-3 sm:flex-nowrap ${isCurrent ? "bg-primary/10 ring-1 ring-primary/40" : step.done ? "bg-[#e5f6ee]/70" : "bg-muted/60"}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full text-base font-semibold ${step.done ? "bg-[#0c5c40] text-white" : isCurrent ? "bg-primary text-primary-foreground" : "bg-background ring-1 ring-foreground/20"}`} aria-hidden>
                  {step.done ? <CheckIcon className="size-5" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {step.title}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {step.done ? `✓ ${g.done}` : isCurrent ? `→ ${g.next}` : g.todo}
                      {step.count ? ` · ${fill(g.count, { n: step.count })}` : ""}
                    </span>
                  </span>
                  <span className="block text-sm text-muted-foreground">{step.help}</span>
                </span>
                <Button variant={isCurrent ? "default" : "outline"} className={`h-11 shrink-0 ${isCurrent ? "px-5" : ""}`} render={<Link href={step.href} />}>{step.button}</Button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
