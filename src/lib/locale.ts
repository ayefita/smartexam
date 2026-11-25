import { cookies } from "next/headers";
import { dictionaries, type Dictionary, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("smartexam_locale")?.value;
  return value === "am" || value === "om" ? value : "en";
}

export async function getDictionary(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await getLocale();
  return { locale, dict: dictionaries[locale] };
}
