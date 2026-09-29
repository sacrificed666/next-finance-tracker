import { DEFAULT_CATEGORY_NAMES, LEGACY_DEFAULT_NAMES } from "../constants";
import type { Category, Locale } from "../types";
import { localeInfo } from "./locales";
import type { MessageKey } from "./dict/en";
import type { Messages } from "./messages";

type Vars = Record<string, string | number>;

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

export function makeI18n(locale: Locale, dict: Messages): I18n {
  const intl = localeInfo(locale).intl;
  const rules = new Intl.PluralRules(intl);
  const lookup = (key: string): string | undefined => dict[key];

  const t = (key: MessageKey, vars?: Vars) => interpolate(lookup(key) ?? key, vars);

  const tp = (key: string, count: number, vars?: Vars) => {
    const form = rules.select(count);
    const template = dict[`${key}.${form}`] ?? dict[`${key}.other`] ?? key;
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
