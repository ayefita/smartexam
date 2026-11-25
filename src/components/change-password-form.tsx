"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Notice } from "@/components/ui-app";
import type { Dictionary } from "@/lib/i18n";

export function ChangePasswordForm({ dict, next }: { dict: Dictionary; next: string }) {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "" });
  const error = state.error === "same_password" ? dict.creds.samePassword : state.error ? dict.errors[state.error as keyof typeof dict.errors] || dict.errors.generic : "";
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Notice error text={error} />
      <Field label={dict.creds.newPassword} hint={dict.errors.password}><Input name="password" type="password" autoComplete="new-password" minLength={8} required className="h-11" /></Field>
      <Field label={dict.creds.confirmPassword}><Input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-11" /></Field>
      <Button type="submit" className="h-11" disabled={pending}>{dict.creds.save}</Button>
    </form>
  );
}
