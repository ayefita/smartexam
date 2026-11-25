import { LoginForm } from "@/components/auth-forms";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui-app";
import { getDictionary } from "@/lib/locale";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const { dict, locale } = await getDictionary();
  const params = await searchParams;
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between"><Logo /><LanguageSwitcher locale={locale} /></div>
      <div>
        <h1 className="font-heading text-3xl">{dict.auth.signIn}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{dict.brandFull}</p>
        {params.notice === "reset" ? <p className="mt-3 text-sm text-primary" role="status">{dict.auth.resetDone}</p> : null}
      </div>
      <LoginForm dict={dict} next={params.next} />
    </main>
  );
}
