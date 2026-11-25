"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/ui-app";
import type { Dictionary, Locale } from "@/lib/i18n";

export function Shell({
  dict,
  locale,
  name,
  role,
  links,
  children,
}: {
  dict: Dictionary;
  locale: Locale;
  name: string;
  role: string;
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label={dict.nav.main} className="grid gap-1">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3e4b4] ${
              active ? "bg-[#1a4032] text-white" : "text-[#d7e4dc] hover:bg-white/10"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2">
        {dict.skip}
      </a>
      <div className="md:grid md:grid-cols-[240px_1fr]">
        <aside className="hidden min-h-screen flex-col bg-[#10281f] p-4 text-[#f6f3ec] md:flex">
          <Logo light />
          <div className="mt-8 flex-1">{nav}</div>
          <p className="mt-6 text-xs text-[#d5e0d8]">{dict.footer}</p>
        </aside>
        <div>
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger render={<Button variant="outline" size="sm" aria-label={dict.nav.menu} />}>
                  {dict.nav.menu}
                </SheetTrigger>
                <SheetContent side="left" className="bg-[#10281f] text-[#f6f3ec]">
                  <SheetHeader>
                    <SheetTitle className="text-[#f6f3ec]">SmartExam</SheetTitle>
                  </SheetHeader>
                  {nav}
                </SheetContent>
              </Sheet>
              <Logo compact />
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <LanguageSwitcher locale={locale} />
              <p className="hidden text-sm sm:block">
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground"> · {role}</span>
              </p>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" className="h-9">
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
