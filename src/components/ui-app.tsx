import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={cn("grid size-9 place-items-center rounded-xl font-heading text-lg font-semibold", light ? "bg-[#f3e4b4] text-[#10281f]" : "bg-primary text-primary-foreground")}>Se</span>
      <span className="min-w-0">
        <span className={cn("block font-heading text-lg leading-none", light && "text-[#f6f3ec]")}>SmartExam</span>
        {compact ? null : <span className={cn("mt-1 block text-[11px] leading-tight", light ? "text-[#d5e0d8]" : "text-muted-foreground")}>Smart Online Examination System</span>}
      </span>
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
        props.className,
      )}
    />
  );
}

export function Notice({ error = false, text }: { error?: boolean; text?: string }) {
  if (!text) return null;
  return (
    <p role="alert" className={cn("rounded-lg px-3 py-2 text-sm", error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
      {text}
    </p>
  );
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" | "wait" }) {
  const tones = {
    neutral: "bg-secondary text-secondary-foreground",
    good: "bg-[#e5f6ee] text-[#0c5c40]",
    bad: "bg-[#fde8ec] text-[#8e1e32]",
    wait: "bg-[#f8efd4] text-[#6b5420]",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/** Shown when a list has nothing in it: what it is, and the one thing to do next. */
export function EmptyState({ title, help, action }: { title: string; help?: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-foreground/20 bg-card/60 p-6">
      <p className="font-heading text-lg">{title}</p>
      {help ? <p className="max-w-xl text-sm text-muted-foreground">{help}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
