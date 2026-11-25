import { Shell, type NavSection } from "@/components/shell";
import { Toaster } from "@/components/ui/sonner";
import { requireUser } from "@/lib/auth";
import { processDueReleases } from "@/lib/domain";
import type { Dictionary } from "@/lib/i18n";
import { getDictionary } from "@/lib/locale";

function linksFor(role: string, dict: Dictionary): NavSection[] {
  const nav = dict.ux.nav;
  if (role === "candidate") {
    return [{ items: [
      { href: "/dashboard", label: dict.ux.student.myExams, icon: "home" },
      { href: "/history", label: nav.myResults, icon: "results" },
      { href: "/notifications", label: nav.messages, icon: "messages" },
    ] }];
  }
  const sections: NavSection[] = [{ items: [
    { href: "/dashboard", label: nav.home, icon: "home" },
    { href: "/questions", label: nav.questions, icon: "questions" },
    { href: "/exams", label: nav.exams, icon: "exams" },
    { href: "/users", label: nav.students, icon: "students" },
    { href: "/reports", label: nav.results, icon: "results" },
  ] }];
  if (role === "super_admin") {
    sections.push({ title: nav.admin, items: [
      { href: "/groups", label: nav.groups, icon: "groups" },
      { href: "/organizations", label: nav.schools, icon: "schools" },
      { href: "/categories", label: nav.categories, icon: "categories" },
      { href: "/departments", label: nav.departments, icon: "departments" },
      { href: "/notifications", label: nav.messages, icon: "messages" },
      { href: "/audit", label: nav.audit, icon: "audit" },
    ] });
  }
  return sections;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { dict, locale } = await getDictionary();
  await processDueReleases();
  return (
    <Shell dict={dict} locale={locale} name={user.fullName} role={dict.ux.roles[user.role]} sections={linksFor(user.role, dict)}>
      {children}
      <Toaster />
    </Shell>
  );
}
