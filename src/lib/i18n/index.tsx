"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { Locale } from "../types";
import { makeI18n, type I18n } from "./core";
import { setFormatLocale } from "./format";
import { LOCALE_COOKIE } from "./locales";
import type { Messages } from "./messages";

export type { MessageKey } from "./dict/en";
export type { I18n } from "./core";

const I18nContext = createContext<I18n>(makeI18n("en", {}));

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo(() => makeI18n(locale, messages), [locale, messages]);
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
