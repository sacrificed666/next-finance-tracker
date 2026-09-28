"use client";

import { useEffect, useState, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { cachedMessages, loadMessages, rememberMessages, type Messages } from "@/lib/i18n/messages";
import { useStore } from "@/lib/state/store";
import type { Locale } from "@/lib/types";

/**
 * Picks the language: the server's guess until the account's own setting arrives,
 * then that. The server's dictionary comes in as a prop; any other is loaded when
 * first needed, and until it arrives the page stays in the language it was showing.
 */
export function LocaleBridge({
  initialLocale,
  initialMessages,
  children,
}: {
  initialLocale: Locale;
  initialMessages: Messages;
  children: ReactNode;
}) {
  const { state, hydrated, loadError } = useStore();
  const wanted = hydrated && !loadError ? state.settings.locale : initialLocale;
  const ready = wanted === initialLocale ? initialMessages : cachedMessages(wanted);
  const [last, setLast] = useState<{ locale: Locale; messages: Messages }>({
    locale: initialLocale,
    messages: initialMessages,
  });

  useEffect(() => {
    rememberMessages(initialLocale, initialMessages);
  }, [initialLocale, initialMessages]);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    loadMessages(wanted)
      .then((messages) => {
        if (alive) setLast({ locale: wanted, messages });
      })
      .catch(() => {
        // Offline or a failed chunk: stay in the language already on screen.
      });
    return () => {
      alive = false;
    };
  }, [wanted, ready]);

  const shown = ready ? { locale: wanted, messages: ready } : last;
  return (
    <I18nProvider locale={shown.locale} messages={shown.messages}>
      {children}
    </I18nProvider>
  );
}
