"use client";

import { usePathname } from "next/navigation";
import { localeAction } from "@/app/actions/auth";
import type { Locale } from "@/lib/i18n";

const options: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "am", label: "አማርኛ" },
  { id: "om", label: "Afaan Oromoo" },
];

export function LanguageSwitcher({ locale, light = false }: { locale: Locale; light?: boolean }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1" role="group" aria-label="Language">
      {options.map((option) => (
        <form key={option.id} action={localeAction}>
          <input type="hidden" name="locale" value={option.id} />
          <input type="hidden" name="next" value={pathname || "/"} />
          <button
            type="submit"
            aria-pressed={locale === option.id}
            className={`h-9 rounded-full px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
              locale === option.id
                ? light
                  ? "bg-[#f3e4b4] text-[#10281f]"
                  : "bg-primary text-primary-foreground"
                : light
                  ? "text-[#f6f3ec] hover:bg-white/10"
                  : "text-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        </form>
      ))}
    </div>
  );
}
