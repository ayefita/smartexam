import Link from "next/link";
import { Logo } from "@/components/ui-app";
import { lookupVerification } from "@/lib/domain";
import { formatAddis } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function PublicVerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { dict, locale } = await getDictionary();
  const result = await lookupVerification(code);
  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-6 px-4 py-10">
      <Logo />
      <h1 className="font-heading text-3xl">{dict.verifyPublic.title}</h1>
      {result ? (
        <article className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">{dict.verifyPublic.lead}</p>
          <h2 className="mt-2 font-heading text-2xl">{result.name}</h2>
          <p>{result.exam}</p>
          <p className="text-sm text-muted-foreground">{result.organization}</p>
          <p className="mt-4 text-lg">{result.percentage}% · {result.passed ? dict.status.passed : dict.status.failed}</p>
          <p className="text-sm">{formatAddis(result.submittedAt, locale)} · {dict.zone}</p>
          <p className="mt-2 font-mono text-sm">{result.code}</p>
        </article>
      ) : <p role="status">{dict.verifyPublic.missing}</p>}
      <Link href="/" className="text-sm underline-offset-4 hover:underline">{dict.brand}</Link>
    </main>
  );
}
