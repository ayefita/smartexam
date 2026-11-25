import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "./db";
import { loginAudit } from "./domain";
import { bool } from "./format";
import { verifyPassword } from "./password";
import { safeNext } from "./format";
import type { Role, User } from "./types";

const SESSION = "smartexam_session";
const OTP = "smartexam_otp";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function setSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await query(`insert into sessions (id, user_id, token_hash, expires_at) values ($1,$2,$3,$4)`, [
    crypto.randomUUID(),
    userId,
    hashToken(token),
    expires.toISOString(),
  ]);
  const jar = await cookies();
  jar.set(SESSION, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION)?.value;
  if (token) await query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
  jar.delete(SESSION);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION)?.value;
  if (!token) return null;
  const rows = await query(
    `select u.*, coalesce(o.name, '') as organization_name
     from sessions s
     join users u on u.id = s.user_id
     left join organizations o on o.id = u.organization_id
     where s.token_hash = $1 and s.expires_at > now() and u.active = true`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  const locale = String(row.locale || "en");
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as Role,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    organizationName: String(row.organization_name ?? ""),
    phone: String(row.phone ?? ""),
    locale: locale === "am" || locale === "om" ? locale : "en",
    active: bool(row.active),
    createdAt: "",
  };
}

export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard?forbidden=1");
  return user;
}

export async function authenticate(email: string, password: string) {
  const rows = await query(
    `select id, email, password_hash, active, verification_channel, phone from users where email = $1`,
    [email.trim().toLowerCase()],
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, String(row.password_hash)))) {
    return { ok: false as const, error: "invalid_credentials" };
  }
  if (!bool(row.active)) {
    return {
      ok: false as const,
      error: "unverified" as const,
      userId: String(row.id),
      email: String(row.email),
      channel: row.verification_channel === "sms" ? "sms" as const : "email" as const,
      destination: row.verification_channel === "sms" ? String(row.phone || "") : String(row.email),
    };
  }
  await setSession(String(row.id));
  const user = await getCurrentUser();
  if (user) await loginAudit(user);
  return { ok: true as const };
}

export async function setOtpCookie(id: string) {
  const jar = await cookies();
  jar.set(OTP, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
  });
}

export async function readOtpCookie() {
  const jar = await cookies();
  return jar.get(OTP)?.value || "";
}

export async function clearOtpCookie() {
  const jar = await cookies();
  jar.delete(OTP);
}

export async function setLocaleCookie(locale: string) {
  const jar = await cookies();
  jar.set("smartexam_locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export { safeNext };
