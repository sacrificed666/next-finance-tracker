import type { Locale } from "../types";

export interface LocaleInfo {
  code: Locale;
  native: string;
  english: string;
  country: string;
  intl: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: "en", native: "English", english: "English", country: "gb", intl: "en-GB" },
  { code: "uk", native: "Українська", english: "Ukrainian", country: "ua", intl: "uk-UA" },
  { code: "de", native: "Deutsch", english: "German", country: "de", intl: "de-DE" },
  { code: "fr", native: "Français", english: "French", country: "fr", intl: "fr-FR" },
  { code: "es", native: "Español", english: "Spanish", country: "es", intl: "es-ES" },
  { code: "pl", native: "Polski", english: "Polish", country: "pl", intl: "pl-PL" },
  { code: "it", native: "Italiano", english: "Italian", country: "it", intl: "it-IT" },
  { code: "nl", native: "Nederlands", english: "Dutch", country: "nl", intl: "nl-NL" },
];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "ft-locale";

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && BY_CODE.has(value as Locale);
}

export function localeInfo(code: Locale): LocaleInfo {
  return BY_CODE.get(code) ?? LOCALES[0];
}

export function matchLocale(candidates: readonly string[] | undefined): Locale {
  for (const raw of candidates ?? []) {
    const base = raw.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function flagUrl(country: string): string {
  return `https://flagcdn.com/${country.toLowerCase()}.svg`;
}
