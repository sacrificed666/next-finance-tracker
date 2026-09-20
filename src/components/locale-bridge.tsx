"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Locale } from "@/lib/types";

export function LocaleBridge({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const { state, hydrated, loadError } = useStore();
  const locale = hydrated && !loadError ? state.settings.locale : initialLocale;
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
