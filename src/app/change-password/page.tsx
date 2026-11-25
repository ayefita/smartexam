import { logoutAction } from "@/app/actions/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Logo } from "@/components/ui-app";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/format";
import { getDictionary } from "@/lib/locale";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser(undefined, { allowPasswordChange: true });
  const params = await searchParams;
  const next = safeNext(params.next);
  const { dict } = await getDictionary();
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
      <Logo />
      <div>
        <h1 className="font-heading text-3xl">{user.mustChangePassword ? dict.creds.changeTitle : dict.world.admin.myPassword}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{user.mustChangePassword ? dict.creds.changeLead : dict.world.admin.myPasswordLead}</p>
        <p className="mt-2 text-sm">{user.fullName} · {user.email}</p>
      </div>
      <ChangePasswordForm dict={dict} next={next} needCurrent={!user.mustChangePassword} />
      {!user.mustChangePassword ? <a href={next} className="text-sm underline-offset-4 hover:underline">{dict.ux.player.back}</a> : null}
      <form action={logoutAction}>
        <button type="submit" className="text-sm underline-offset-4 hover:underline">{dict.nav.signOut}</button>
      </form>
    </main>
  );
}
