"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { DEFAULT_CATEGORY_NAMES, LEGACY_DEFAULT_NAMES } from "../constants";
import type { Category, Locale } from "../types";
import { setFormatLocale } from "./format";
import { LOCALE_COOKIE, localeInfo } from "./locales";
import { en, type MessageKey } from "./dict/en";
import { uk } from "./dict/uk";
import { de } from "./dict/de";
import { fr } from "./dict/fr";
import { es } from "./dict/es";
import { pl } from "./dict/pl";
import { it } from "./dict/it";
import { nl } from "./dict/nl";

export type { MessageKey } from "./dict/en";

type Vars = Record<string, string | number>;

const DICTS: Record<Locale, Record<string, string>> = { en, uk, de, fr, es, pl, it, nl };

export interface I18n {
  locale: Locale;
  intl: string;
  t: (key: MessageKey, vars?: Vars) => string;
  tp: (key: string, count: number, vars?: Vars) => string;
  has: (key: string) => boolean;
  tk: (key: string, fallback: string, vars?: Vars) => string;
  category: (cat: Pick<Category, "id" | "name"> | undefined) => string;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

function makeI18n(locale: Locale): I18n {
  const dict = DICTS[locale] ?? en;
  const intl = localeInfo(locale).intl;
  const rules = new Intl.PluralRules(intl);
  const lookup = (key: string): string | undefined => dict[key] ?? (en as Record<string, string>)[key];

  const t = (key: MessageKey, vars?: Vars) => interpolate(lookup(key) ?? key, vars);

  const tp = (key: string, count: number, vars?: Vars) => {
    const form = rules.select(count);
    const template =
      dict[`${key}.${form}`] ??
      dict[`${key}.other`] ??
      (en as Record<string, string>)[`${key}.${count === 1 ? "one" : "other"}`] ??
      key;
    return interpolate(template, { count, ...vars });
  };

  const has = (key: string) => lookup(key) !== undefined;

  const tk = (key: string, fallback: string, vars?: Vars) =>
    interpolate(lookup(key) ?? fallback, vars);

  const category = (cat: Pick<Category, "id" | "name"> | undefined) => {
    if (!cat) return t("common.uncategorized");
    const defaultName = DEFAULT_CATEGORY_NAMES.get(cat.id);
    const untouched =
      defaultName !== undefined &&
      (cat.name === defaultName || LEGACY_DEFAULT_NAMES[cat.id] === cat.name);
    if (!untouched) return cat.name;
    return lookup(`category.${cat.id}`) ?? cat.name;
  };

  return { locale, intl, t, tp, has, tk, category };
}

const I18nContext = createContext<I18n>(makeI18n("en"));

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => makeI18n(locale), [locale]);
  setFormatLocale(value.intl);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  return useContext(I18nContext);
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  return makeI18n(locale).t(key, vars);
}
