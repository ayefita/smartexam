import fs from "fs";
import path from "path";

export type DeliveryMode = "dev" | "live";

function emailProvider(): "resend" | "smtp" | null {
  const choice = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  if (choice === "resend" || (!choice && process.env.RESEND_API_KEY)) return "resend";
  if (choice === "smtp" || (!choice && process.env.SMTP_HOST)) return "smtp";
  return null;
}

function smsProvider(): "twilio" | "afromessage" | null {
  const choice = (process.env.SMS_PROVIDER || "").toLowerCase();
  if (choice === "twilio" || (!choice && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)) return "twilio";
  if (choice === "afromessage" || (!choice && process.env.AFROMESSAGE_TOKEN)) return "afromessage";
  return null;
}

/** True when a real SMS provider is configured. Without one, codes are offered by email only. */
export function smsEnabled() {
  return smsProvider() !== null;
}

export function channelMode(channel: "email" | "sms"): DeliveryMode {
  const forced = (process.env.OTP_DELIVERY || "").toLowerCase();
  if (forced === "dev") return "dev";
  if (forced === "live") return "live";
  if (channel === "email") return emailProvider() ? "live" : "dev";
  return smsProvider() ? "live" : "dev";
}

function logDev(kind: string, destination: string, body: string) {
  const line = `${new Date().toISOString()} ${kind} ${destination} ${body}`;
  console.log(`[SmartExam] ${line}`);
  try {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "otp-dev.log"), line + "\n");
  } catch {
    // Console output is the source of truth in dev.
  }
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (channelMode("email") === "dev") {
    logDev("email", to, `${subject} :: ${text}`);
    return { ok: true as const, mode: "dev" as const };
  }
  const provider = emailProvider();
  if (provider === "resend") {
    const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "SmartExam <noreply@smartexam.et>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ok: false as const, mode: "live" as const, error: `Resend ${response.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true as const, mode: "live" as const };
  }
  if (provider === "smtp") {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || "SmartExam <noreply@smartexam.et>",
      to,
      subject,
      text,
    });
    return { ok: true as const, mode: "live" as const };
  }
  return { ok: false as const, mode: "live" as const, error: "No email provider is configured." };
}

export async function sendSms(to: string, text: string) {
  if (channelMode("sms") === "dev") {
    logDev("sms", to, text);
    return { ok: true as const, mode: "dev" as const };
  }
  const provider = smsProvider();
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID || "";
    const token = process.env.TWILIO_AUTH_TOKEN || "";
    const from = process.env.TWILIO_FROM || "";
    const body = new URLSearchParams({ To: to, From: from, Body: text });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ok: false as const, mode: "live" as const, error: `Twilio ${response.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true as const, mode: "live" as const };
  }
  if (provider === "afromessage") {
    const endpoint = process.env.AFROMESSAGE_API_URL || "https://api.afromessage.com/api/send";
    const url = new URL(endpoint);
    const sender = process.env.AFROMESSAGE_SENDER || "SmartExam";
    const identifier = process.env.AFROMESSAGE_IDENTIFIER || "";
    url.searchParams.set("sender", sender);
    url.searchParams.set("to", to.replace(/^\+/, ""));
    url.searchParams.set("message", text);
    if (identifier) url.searchParams.set("from", identifier);
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.AFROMESSAGE_TOKEN}` },
    });
    const payload = (await response.json().catch(() => ({}))) as { acknowledge?: string; response?: unknown };
    if (!response.ok || (payload.acknowledge && payload.acknowledge !== "success")) {
      return {
        ok: false as const,
        mode: "live" as const,
        error: `AfroMessage ${response.status}: ${JSON.stringify(payload.response || payload).slice(0, 200)}`,
      };
    }
    return { ok: true as const, mode: "live" as const };
  }
  return { ok: false as const, mode: "live" as const, error: "No SMS provider is configured." };
}
