import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { processDueReleases } from "@/lib/domain";
import type { Dictionary } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

function linksFor(role: string, dict: Dictionary) {
  const staff = [
    { href: "/dashboard", label: dict.nav.dashboard },
    { href: "/questions", label: dict.nav.questions },
    { href: "/exams", label: dict.nav.exams },
    { href: "/reports", label: dict.nav.reports },
    { href: "/departments", label: dict.nav.departments },
    { href: "/users", label: dict.nav.users },
    { href: "/groups", label: dict.nav.groups },
    { href: "/notifications", label: dict.nav.notifications },
  ];
  if (role === "super_admin") {
    staff.splice(4, 0, { href: "/organizations", label: dict.nav.organizations }, { href: "/categories", label: dict.nav.categories });
    staff.push({ href: "/audit", label: dict.nav.audit });
  }
  if (role === "candidate") {
    return [
      { href: "/dashboard", label: dict.nav.dashboard },
      { href: "/history", label: dict.nav.history },
      { href: "/notifications", label: dict.nav.notifications },
    ];
  }
  return staff;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { dict, locale } = await getDictionary();
  await processDueReleases();
  return (
    <Shell dict={dict} locale={locale} name={user.fullName} role={dict.roles[user.role]} links={linksFor(user.role, dict)}>
      {children}
    </Shell>
  );
}
