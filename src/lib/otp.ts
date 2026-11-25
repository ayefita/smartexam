import { createHash, randomInt, timingSafeEqual } from "crypto";
import { query } from "./db";
import { bool, iso, num } from "./format";
import { channelMode, sendEmail, sendSms, smsEnabled } from "./messaging";
import { hashPassword } from "./password";
import { maskDestination, normalizeEthiopianPhone } from "./phone";

export const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 10) * 60 * 1000;
export const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const COOLDOWN_MS = 60_000;
const HOURLY_LIMIT = 5;

function hashCode(code: string, destination: string) {
  const pepper = process.env.OTP_PEPPER || "smartexam-dev-pepper";
  return createHash("sha256").update(`${pepper}:${destination}:${code}`).digest("hex");
}

function hashesMatch(stored: string, given: string) {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function otpText(code: string, purpose: "register" | "reset") {
  const minutes = Math.round(OTP_TTL_MS / 60000);
  const why = purpose === "reset" ? "reset your SmartExam password" : "verify your SmartExam account";
  return `SmartExam code: ${code}. Use it to ${why}. It expires in ${minutes} minutes. If you did not ask for this, ignore it.`;
}

async function deliver(channel: "email" | "sms", destination: string, code: string, purpose: "register" | "reset") {
  const text = otpText(code, purpose);
  if (channel === "email") {
    const subject = purpose === "reset" ? "SmartExam password reset code" : "SmartExam verification code";
    return sendEmail(destination, subject, text);
  }
  return sendSms(destination, text);
}

export async function issueOtp(input: {
  purpose: "register" | "reset";
  channel: "email" | "sms";
  destination: string;
  userId: string;
}) {
  if (input.channel === "sms" && !smsEnabled()) return { ok: false as const, error: "sms_unavailable" };
  const latest = await query(
    `select created_at from verification_codes where destination = $1 and purpose = $2 order by created_at desc limit 1`,
    [input.destination, input.purpose],
  );
  if (latest[0]?.created_at && Date.now() - new Date(String(latest[0].created_at)).getTime() < COOLDOWN_MS) {
    return { ok: false as const, error: "otp_cooldown" };
  }
  const hour = await query(
    `select count(*) as n from verification_codes
     where destination = $1 and purpose = $2 and created_at > now() - interval '1 hour'`,
    [input.destination, input.purpose],
  );
  if (num(hour[0]?.n) >= HOURLY_LIMIT) return { ok: false as const, error: "otp_rate" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + OTP_TTL_MS).toISOString();
  await query(
    `update verification_codes set consumed_at = now()
     where user_id = $1 and purpose = $2 and consumed_at is null`,
    [input.userId, input.purpose],
  );
  await query(
    `insert into verification_codes (id, purpose, channel, destination, code_hash, user_id, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, input.purpose, input.channel, input.destination, hashCode(code, input.destination), input.userId, expires],
  );
  const sent = await deliver(input.channel, input.destination, code, input.purpose);
  if (!sent.ok) {
    await query(`update verification_codes set consumed_at = now() where id = $1`, [id]);
    return { ok: false as const, error: "otp_send" };
  }
  return {
    ok: true as const,
    id,
    masked: maskDestination(input.channel, input.destination),
    dev: sent.mode === "dev",
    channel: input.channel,
  };
}

export async function latestOpenOtp(userId: string, purpose: "register" | "reset") {
  const rows = await query(
    `select id, channel, destination from verification_codes
     where user_id = $1 and purpose = $2 and consumed_at is null and expires_at > now() and attempts < $3
     order by created_at desc limit 1`,
    [userId, purpose, OTP_MAX_ATTEMPTS],
  );
  if (!rows[0]) return null;
  const channel = rows[0].channel === "sms" ? "sms" : "email";
  return {
    id: String(rows[0].id),
    channel,
    masked: maskDestination(channel, String(rows[0].destination)),
    dev: channelMode(channel) === "dev",
  };
}

export async function readOtp(id: string) {
  const rows = await query(`select * from verification_codes where id = $1`, [id]);
  if (!rows[0] || rows[0].consumed_at) return null;
  const channel: "email" | "sms" = rows[0].channel === "sms" ? "sms" : "email";
  return {
    id: String(rows[0].id),
    purpose: rows[0].purpose === "reset" ? "reset" as const : "register" as const,
    channel,
    destination: String(rows[0].destination),
    masked: maskDestination(channel, String(rows[0].destination)),
    userId: String(rows[0].user_id),
    attempts: num(rows[0].attempts),
    expiresAt: iso(rows[0].expires_at) || "",
    dev: channelMode(channel) === "dev",
    expired: new Date(String(rows[0].expires_at)).getTime() <= Date.now(),
    locked: num(rows[0].attempts) >= OTP_MAX_ATTEMPTS,
  };
}

export async function verifyOtp(id: string, code: string) {
  const rows = await query(`select * from verification_codes where id = $1`, [id]);
  const row = rows[0];
  if (!row || row.consumed_at) return { ok: false as const, error: "otp_invalid" };
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return { ok: false as const, error: "otp_expired" };
  if (num(row.attempts) >= OTP_MAX_ATTEMPTS) return { ok: false as const, error: "otp_attempts" };
  const destination = String(row.destination);
  const given = hashCode(code.replace(/\s/g, ""), destination);
  if (!hashesMatch(String(row.code_hash), given)) {
    const attempts = num(row.attempts) + 1;
    await query(`update verification_codes set attempts = $2 where id = $1`, [id, attempts]);
    if (attempts >= OTP_MAX_ATTEMPTS) return { ok: false as const, error: "otp_attempts" };
    return { ok: false as const, error: "otp_invalid", remaining: OTP_MAX_ATTEMPTS - attempts };
  }
  await query(`update verification_codes set consumed_at = now() where id = $1`, [id]);
  return {
    ok: true as const,
    userId: String(row.user_id),
    purpose: row.purpose === "reset" ? "reset" as const : "register" as const,
  };
}

export async function registerCandidateAccount(input: {
  fullName: string;
  email: string;
  phone: string;
  organizationId: string;
  password: string;
  channel: "email" | "sms";
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = input.phone.trim() ? normalizeEthiopianPhone(input.phone) : null;
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.password.length < 8) {
    return { ok: false as const, error: "validation" };
  }
  if (input.channel === "sms" && !smsEnabled()) return { ok: false as const, error: "sms_unavailable" };
  if (input.channel === "sms" && !phone) return { ok: false as const, error: "phone" };
  if (input.phone.trim() && !phone) return { ok: false as const, error: "phone" };
  const org = await query(`select id from organizations where id = $1`, [input.organizationId]);
  if (!org[0]) return { ok: false as const, error: "validation" };

  const byEmail = await query(`select id, active from users where email = $1`, [email]);
  if (byEmail[0] && bool(byEmail[0].active)) return { ok: false as const, error: "email_taken" };
  if (phone) {
    const byPhone = await query(`select id from users where phone = $1 and id <> $2`, [phone, byEmail[0]?.id || ""]);
    if (byPhone[0]) return { ok: false as const, error: "phone_taken" };
  }

  const passwordHash = await hashPassword(input.password);
  const userId = byEmail[0] ? String(byEmail[0].id) : crypto.randomUUID();
  if (byEmail[0]) {
    await query(
      `update users set full_name = $1, password_hash = $2, organization_id = $3, phone = $4, verification_channel = $5, active = false, role = 'candidate' where id = $6`,
      [fullName, passwordHash, input.organizationId, phone || "", input.channel, userId],
    );
  } else {
    await query(
      `insert into users (id, email, password_hash, full_name, role, organization_id, phone, active, verification_channel)
       values ($1,$2,$3,$4,'candidate',$5,$6,false,$7)`,
      [userId, email, passwordHash, fullName, input.organizationId, phone || "", input.channel],
    );
  }
  const destination = input.channel === "sms" ? phone! : email;
  const issued = await issueOtp({ purpose: "register", channel: input.channel, destination, userId });
  if (!issued.ok && issued.error === "otp_cooldown") {
    const open = await latestOpenOtp(userId, "register");
    if (open) return { ok: true as const, id: open.id, masked: open.masked, dev: open.dev, channel: open.channel, userId };
  }
  if (!issued.ok) return issued;
  return { ...issued, userId };
}

export async function requestPasswordReset(identifier: string) {
  const { classifyIdentifier } = await import("./phone");
  const parsed = classifyIdentifier(identifier);
  if (!parsed) return { ok: true as const, sent: false };
  if (parsed.channel === "sms" && !smsEnabled()) return { ok: false as const, error: "sms_unavailable" };
  const rows = await query(
    `select id, email, phone, active from users where email = $1 or (phone <> '' and phone = $1) limit 1`,
    [parsed.destination],
  );
  if (!rows[0]) return { ok: true as const, sent: false };
  const channel = parsed.channel;
  const destination = channel === "sms" ? String(rows[0].phone || "") : String(rows[0].email);
  if (!destination) return { ok: true as const, sent: false };
  if (channel === "sms" && destination !== parsed.destination) return { ok: true as const, sent: false };
  const issued = await issueOtp({ purpose: "reset", channel, destination, userId: String(rows[0].id) });
  if (!issued.ok && issued.error === "otp_cooldown") {
    const open = await latestOpenOtp(String(rows[0].id), "reset");
    if (open) return { ok: true as const, sent: true as const, id: open.id, masked: open.masked, dev: open.dev, channel: open.channel };
  }
  if (!issued.ok) return issued;
  return { ok: true as const, sent: true as const, id: issued.id, masked: issued.masked, dev: issued.dev, channel: issued.channel };
}

export async function completePasswordReset(userId: string, password: string) {
  if (password.length < 8) return { ok: false as const, error: "password" };
  const hash = await hashPassword(password);
  await query(`update users set password_hash = $1, active = true where id = $2`, [hash, userId]);
  await query(`delete from sessions where user_id = $1`, [userId]);
  return { ok: true as const };
}

export async function activateUser(userId: string) {
  await query(`update users set active = true where id = $1`, [userId]);
}
