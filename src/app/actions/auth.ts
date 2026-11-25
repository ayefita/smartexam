"use server";

import { redirect } from "next/navigation";
import { authenticate, clearOtpCookie, clearSession, readOtpCookie, setLocaleCookie, setOtpCookie, setSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { smsEnabled } from "@/lib/messaging";
import { safeNext } from "@/lib/format";
import { issueOtp, latestOpenOtp, readOtp, registerCandidateAccount, requestPasswordReset, verifyOtp, activateUser, completePasswordReset } from "@/lib/otp";

export async function loginAction(_prev: { error: string }, formData: FormData) {
  const result = await authenticate(String(formData.get("email") || ""), String(formData.get("password") || ""));
  if (result.ok) redirect(safeNext(String(formData.get("next") || "")));
  if (result.error === "unverified") {
    // Without an SMS provider, phone-verified accounts get their code by email instead.
    const channel = result.channel === "sms" && smsEnabled() ? "sms" : "email";
    const issued = await issueOtp({
      purpose: "register",
      channel,
      destination: channel === result.channel ? result.destination || "" : result.email || "",
      userId: result.userId || "",
    });
    const open = issued.ok ? issued : await latestOpenOtp(result.userId || "", "register");
    if (open && "id" in open && open.id) {
      await setOtpCookie(open.id);
      redirect("/verify-account?notice=unverified");
    }
    return { error: issued.ok ? "generic" : issued.error };
  }
  return { error: result.error };
}

export async function registerAction(_prev: { error: string }, formData: FormData) {
  const password = String(formData.get("password") || "");
  if (password !== String(formData.get("confirm") || "")) return { error: "password_match" };
  const channel = formData.get("channel") === "sms" ? "sms" : "email";
  const result = await registerCandidateAccount({
    fullName: String(formData.get("fullName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    organizationId: String(formData.get("organizationId") || ""),
    password,
    channel,
  });
  if (!result.ok) return { error: result.error };
  await setOtpCookie(result.id);
  redirect("/verify-account?notice=registered");
}

export async function forgotAction(_prev: { error: string; info: string }, formData: FormData) {
  const result = await requestPasswordReset(String(formData.get("identifier") || ""));
  if (!result.ok) return { error: result.error, info: "" };
  if (result.sent && "id" in result && result.id) {
    await setOtpCookie(result.id);
    redirect("/verify-account?notice=reset");
  }
  return { error: "", info: "sent" };
}

export async function verifyAction(_prev: { error: string }, formData: FormData) {
  const id = await readOtpCookie();
  const checked = await verifyOtp(id, String(formData.get("code") || ""));
  if (!checked.ok) return { error: checked.error };
  if (checked.purpose === "register") {
    await activateUser(checked.userId);
    await clearOtpCookie();
    await setSession(checked.userId);
    redirect("/dashboard");
  }
  const done = await completePasswordReset(checked.userId, String(formData.get("password") || ""));
  if (!done.ok) return { error: done.error };
  await clearOtpCookie();
  redirect("/login?notice=reset");
}

export async function resendAction() {
  const current = await readOtp(await readOtpCookie());
  if (!current || current.expired || current.locked) return { error: "otp_expired" };
  const issued = await issueOtp({
    purpose: current.purpose,
    channel: current.channel === "sms" ? "sms" : "email",
    destination: current.destination,
    userId: current.userId,
  });
  if (!issued.ok) return { error: issued.error };
  await setOtpCookie(issued.id);
  return { error: "" };
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function localeAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const next = safeNext(String(formData.get("next") || "/"));
  if (locale === "en" || locale === "am" || locale === "om") {
    await setLocaleCookie(locale);
    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();
    if (user) await query(`update users set locale = $1 where id = $2`, [locale, user.id]);
  }
  redirect(next);
}
