/** Ethiopian mobiles: 09xxxxxxxx or 07xxxxxxxx, stored as +2519xxxxxxxx / +2517xxxxxxxx. */
export function normalizeEthiopianPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (!compact) return null;
  let national = compact;
  if (national.startsWith("+251")) national = national.slice(4);
  else if (national.startsWith("251")) national = national.slice(3);
  else if (national.startsWith("0")) national = national.slice(1);
  if (!/^[79]\d{8}$/.test(national)) return null;
  return `+251${national}`;
}

export function maskDestination(channel: "email" | "sms", destination: string) {
  if (channel === "email") {
    const [name, domain] = destination.split("@");
    if (!domain) return "•••";
    return `${name.slice(0, 1)}•••@${domain}`;
  }
  if (destination.length < 8) return "•••";
  return `${destination.slice(0, 5)}••••${destination.slice(-3)}`;
}

export function classifyIdentifier(value: string): { channel: "email" | "sms"; destination: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
    return { channel: "email", destination: trimmed.toLowerCase() };
  }
  const phone = normalizeEthiopianPhone(trimmed);
  if (!phone) return null;
  return { channel: "sms", destination: phone };
}
