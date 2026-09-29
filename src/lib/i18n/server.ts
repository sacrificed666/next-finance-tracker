import "server-only";
import { cookies, headers } from "next/headers";
import type { Locale } from "../types";
import { isLocale, LOCALE_COOKIE, matchLocale } from "./locales";
import { de } from "./dict/de";
import { en, type MessageKey } from "./dict/en";
import { es } from "./dict/es";
import { fr } from "./dict/fr";
import { it } from "./dict/it";
import { nl } from "./dict/nl";
import { pl } from "./dict/pl";
import { uk } from "./dict/uk";

const DICTS: Record<Locale, Record<string, string>> = { en, uk, de, fr, es, pl, it, nl };

export function serverMessages(locale: Locale): Record<string, string> {
  return DICTS[locale];
}

export async function requestLocale(): Promise<Locale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;
  const accept = (await headers()).get("accept-language") ?? "";
  return matchLocale(accept.split(",").map((part) => part.split(";")[0].trim()));
}

export function serverT(locale: Locale): (key: MessageKey) => string {
  return (key) => DICTS[locale][key] ?? en[key];
}
