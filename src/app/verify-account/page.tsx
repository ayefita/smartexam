import Link from "next/link";
import { VerifyForm } from "@/components/auth-forms";
import { Logo } from "@/components/ui-app";
import { readOtpCookie } from "@/lib/auth";
import { getDictionary } from "@/lib/locale";
import { readOtp } from "@/lib/otp";

export default async function VerifyAccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { dict } = await getDictionary();
  const params = await searchParams;
  const otp = await readOtp(await readOtpCookie());
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
      <Logo />
      <div>
        <h1 className="font-heading text-3xl">{dict.auth.verifyTitle}</h1>
        {params.notice === "registered" ? <p className="mt-2 text-sm text-primary" role="status">{dict.auth.registered}</p> : null}
        {params.notice === "unverified" ? <p className="mt-2 text-sm text-primary" role="status">{dict.auth.unverified}</p> : null}
      </div>
      {otp ? <VerifyForm dict={dict} masked={otp.masked} purpose={otp.purpose} dev={otp.dev} /> : <p className="text-sm" role="alert">{dict.errors.otp_expired}</p>}
      <Link href="/login" className="text-sm underline-offset-4 hover:underline">{dict.auth.signIn}</Link>
    </main>
  );
}
