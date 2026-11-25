import Link from "next/link";
import { ForgotForm } from "@/components/auth-forms";
import { Logo } from "@/components/ui-app";
import { getDictionary } from "@/lib/locale";

export default async function ForgotPage() {
  const { dict } = await getDictionary();
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
      <Logo />
      <div>
        <h1 className="font-heading text-3xl">{dict.auth.forgot}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{dict.auth.forgotLead}</p>
      </div>
      <ForgotForm dict={dict} />
      <Link href="/login" className="text-sm underline-offset-4 hover:underline">{dict.auth.signIn}</Link>
    </main>
  );
}
