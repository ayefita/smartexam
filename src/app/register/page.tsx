import { RegisterForm } from "@/components/auth-forms";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui-app";
import { listOrganizations } from "@/lib/domain";
import { getDictionary } from "@/lib/locale";

export default async function RegisterPage() {
  const { dict, locale } = await getDictionary();
  const organizations = await listOrganizations();
  return (
    <main className="mx-auto grid min-h-screen max-w-md gap-6 px-4 py-10">
      <div className="flex items-center justify-between"><Logo /><LanguageSwitcher locale={locale} /></div>
      <div>
        <h1 className="font-heading text-3xl">{dict.auth.register}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{dict.auth.registerLead}</p>
      </div>
      <RegisterForm dict={dict} organizations={organizations} />
    </main>
  );
}
