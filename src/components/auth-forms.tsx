"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { forgotAction, loginAction, registerAction, resendAction, verifyAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice } from "@/components/ui-app";
import { fill, type Dictionary } from "@/lib/i18n";
import type { Organization } from "@/lib/types";

const demos = [
  ["admin@smartexam.et", "SmartExam#Admin1", "admin"],
  ["teacher@aau.edu.et", "SmartExam#Teach1", "teacher"],
  ["abel@student.et", "SmartExam#Take1", "candidate"],
] as const;

export function LoginForm({ dict, next }: { dict: Dictionary; next?: string }) {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next || ""} />
      <Notice error text={state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <Field label={dict.common.email}><Input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11" /></Field>
      <Field label={dict.auth.password}><Input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" /></Field>
      <Button type="submit" className="h-11" disabled={pending}>{dict.auth.signIn}</Button>
      <div className="flex justify-between text-sm">
        <Link href="/forgot" className="underline-offset-4 hover:underline">{dict.auth.forgot}</Link>
        <Link href="/register" className="underline-offset-4 hover:underline">{dict.auth.noAccount}</Link>
      </div>
      <div className="rounded-xl bg-muted p-3">
        <p className="text-sm font-medium">{dict.auth.demoTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{dict.auth.demoHint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {demos.map(([demoEmail, demoPassword, label]) => (
            <Button key={demoEmail} type="button" variant="outline" className="h-9" onClick={() => { setEmail(demoEmail); setPassword(demoPassword); }}>
              {dict.auth.use} {label === "admin" ? dict.roles.super_admin : label === "teacher" ? dict.roles.exam_manager : dict.roles.candidate}
            </Button>
          ))}
        </div>
      </div>
    </form>
  );
}

export function RegisterForm({ dict, organizations }: { dict: Dictionary; organizations: Organization[] }) {
  const [state, action, pending] = useActionState(registerAction, { error: "" });
  const [channel, setChannel] = useState<"email" | "sms">("email");
  return (
    <form action={action} className="grid gap-4">
      <Notice error text={state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      <Field label={dict.auth.fullName}><Input name="fullName" required autoComplete="name" className="h-11" /></Field>
      <Field label={dict.common.email}><Input name="email" type="email" required autoComplete="email" className="h-11" /></Field>
      <Field label={dict.common.phone} hint={dict.errors.phone}><Input name="phone" inputMode="tel" autoComplete="tel" placeholder="+251 9xx xxx xxx" className="h-11" required={channel === "sms"} /></Field>
      <Field label={dict.auth.organization}>
        <select name="organizationId" required className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm">
          {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">{dict.auth.channel}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} /> {dict.auth.channelEmail}</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="channel" value="sms" checked={channel === "sms"} onChange={() => setChannel("sms")} /> {dict.auth.channelSms}</label>
      </fieldset>
      <Field label={dict.auth.password}><Input name="password" type="password" required minLength={8} autoComplete="new-password" className="h-11" /></Field>
      <Field label={dict.auth.confirmPassword}><Input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="h-11" /></Field>
      <Button type="submit" className="h-11" disabled={pending}>{dict.auth.register}</Button>
      <Link href="/login" className="text-sm underline-offset-4 hover:underline">{dict.auth.hasAccount}</Link>
    </form>
  );
}

export function ForgotForm({ dict }: { dict: Dictionary }) {
  const [state, action, pending] = useActionState(forgotAction, { error: "", info: "" });
  return (
    <form action={action} className="grid gap-4">
      <Notice error text={state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      {state.info ? <Notice text={dict.auth.forgotLead} /> : null}
      <Field label={`${dict.common.email} / ${dict.common.phone}`}><Input name="identifier" required autoComplete="username" className="h-11" /></Field>
      <Button type="submit" className="h-11" disabled={pending}>{dict.auth.sendCode}</Button>
    </form>
  );
}

export function VerifyForm({ dict, masked, purpose, dev }: { dict: Dictionary; masked: string; purpose: "register" | "reset"; dev: boolean }) {
  const [state, action, pending] = useActionState(verifyAction, { error: "" });
  const [resend, setResend] = useState("");
  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-muted-foreground">{fill(dict.auth.verifyLead, { dest: masked })}</p>
      {dev ? <Notice text={dict.auth.verifyDev} /> : null}
      <Notice error text={state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : ""} />
      {resend ? <Notice error={resend !== "ok"} text={resend === "ok" ? dict.auth.sendCode : dict.errors[resend as keyof typeof dict.errors] || dict.errors.generic} /> : null}
      <Field label={dict.auth.code}>
        <Input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} className="h-11 tracking-[0.3em]" />
      </Field>
      {purpose === "reset" ? <Field label={dict.auth.newPassword}><Input name="password" type="password" required minLength={8} autoComplete="new-password" className="h-11" /></Field> : null}
      <Button type="submit" className="h-11" disabled={pending}>{purpose === "reset" ? dict.auth.resetTitle : dict.auth.verify}</Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={async () => {
          const result = await resendAction();
          setResend(result.error || "ok");
        }}
      >
        {dict.auth.resend}
      </Button>
    </form>
  );
}
