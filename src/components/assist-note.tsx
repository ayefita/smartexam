export function AssistNote({ source, off, local, model, review }: { source?: string; off: string; local: string; model: string; review: string }) {
  const lead = source === "model" ? model : source === "local" || source === "demo" ? local : off;
  return <p className="text-sm text-muted-foreground">{lead} {source ? review : ""}</p>;
}
