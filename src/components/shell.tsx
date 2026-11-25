"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3Icon,
  BookOpenIcon,
  Building2Icon,
  ClipboardListIcon,
  FileQuestionIcon,
  FolderTreeIcon,
  HistoryIcon,
  HomeIcon,
  LayersIcon,
  MailIcon,
  MenuIcon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/ui-app";
import type { Dictionary, Locale } from "@/lib/i18n";

const icons = {
  home: HomeIcon,
  questions: FileQuestionIcon,
  exams: ClipboardListIcon,
  students: UsersIcon,
  results: BarChart3Icon,
  groups: UsersRoundIcon,
  schools: Building2Icon,
  categories: LayersIcon,
  departments: FolderTreeIcon,
  messages: MailIcon,
  audit: HistoryIcon,
  book: BookOpenIcon,
};

export type NavItem = { href: string; label: string; icon: keyof typeof icons };
export type NavSection = { title?: string; items: NavItem[] };

export function Shell({
  dict,
  locale,
  name,
  role,
  sections,
  children,
}: {
  dict: Dictionary;
  locale: Locale;
  name: string;
  role: string;
  sections: NavSection[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label={dict.nav.main} className="grid gap-5">
      {sections.map((section, index) => (
        <div key={section.title || index} className="grid gap-1">
          {section.title ? <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#b8cbbf]">{section.title}</p> : null}
          {section.items.map((link) => {
            const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`)) || (link.href !== "/dashboard" && pathname === link.href);
            const Icon = icons[link.icon] || BookOpenIcon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3e4b4] ${
                  active ? "bg-[#f3e4b4] font-semibold text-[#10281f]" : "text-[#e3ece6] hover:bg-white/10"
                }`}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
  const who = (
    <p className="text-sm leading-tight">
      <span className="block font-medium">{name}</span>
      <span className="block text-xs opacity-80">{role}</span>
      <Link href="/change-password" className="mt-1 block text-xs underline underline-offset-4 opacity-80 hover:opacity-100">{dict.world.admin.myPassword}</Link>
    </p>
  );
  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        {dict.skip}
      </a>
      <div className="md:grid md:grid-cols-[240px_1fr]">
        <aside className="hidden min-h-screen bg-[#10281f] text-[#f6f3ec] md:block">
          <div className="sticky top-0 flex max-h-screen flex-col overflow-y-auto p-4">
            <Logo light />
            <div className="mt-8">{nav}</div>
            <div className="mt-6 rounded-xl bg-white/5 p-3">{who}</div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger render={<Button variant="outline" className="h-10 gap-2" aria-label={dict.nav.menu} />}>
                  <MenuIcon className="size-5" aria-hidden />
                  {dict.ux.nav.menu}
                </SheetTrigger>
                <SheetContent side="left" className="overflow-y-auto bg-[#10281f] text-[#f6f3ec]">
                  <SheetHeader>
                    <SheetTitle className="text-[#f6f3ec]">SmartExam</SheetTitle>
                  </SheetHeader>
                  <div className="px-4 pb-3">{who}</div>
                  <div className="px-2 pb-4">{nav}</div>
                  <form action={logoutAction} className="px-4 pb-6">
                    <Button type="submit" variant="outline" className="h-11 w-full text-foreground">{dict.nav.signOut}</Button>
                  </form>
                </SheetContent>
              </Sheet>
              <span className="hidden min-[420px]:block"><Logo compact /></span>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <LanguageSwitcher locale={locale} />
              <div className="hidden text-right sm:block md:hidden lg:block">{who}</div>
              <form action={logoutAction} className="hidden sm:block">
                <Button type="submit" variant="outline" className="h-10">
                  {dict.nav.signOut}
                </Button>
              </form>
            </div>
          </header>
          <main id="main" className="px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
