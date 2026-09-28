"use client";

import { useState } from "react";
import { Card, Field, Icon, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL, FOREIGN_CURRENCIES } from "@/lib/constants";
import { formatDateTime, nextHourLabel } from "@/lib/date";
import { parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { AppState } from "@/lib/types";

/** A number that only commits on blur or Enter, so half-typed values never reach the state. */
function NumericSetting({
  label,
  hint,
  value,
  isValid,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number;
  isValid: (v: number) => boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseAmount(draft);
    if (Number.isFinite(parsed) && isValid(parsed)) onCommit(parsed);
    setDraft(null);
  };

  return (
    <Field label={label} hint={hint}>
      <TextInput
        inputMode="decimal"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
    </Field>
  );
}

export function ratesOrigin(settings: AppState["settings"], t: ReturnType<typeof useT>["t"]): string {
  if (!settings.ratesUpdatedAt) return t("settings.rates.starting");
  const source =
    settings.ratesSource === "monobank"
      ? t("settings.rates.source.monobank")
      : settings.ratesSource === "nbu"
        ? t("settings.rates.source.nbu")
        : t("settings.rates.source.manual");
  return t("settings.rates.updated", { when: formatDateTime(settings.ratesUpdatedAt), source });
}

/** Exchange rates: refreshed hourly, editable by hand. */
export function RatesCard() {
  const { state, update } = useStore();
  const { settings } = state;
  const { t } = useT();
  const meta = settings.ratesMeta;

  const setRate = (currency: (typeof FOREIGN_CURRENCIES)[number], value: number) =>
    update((s) => ({
      ...s,
      settings: {
        ...s.settings,
        rates: { ...s.settings.rates, [currency]: value },
        ratesSource: "manual",
        ratesMeta: undefined,
        ratesUpdatedAt: new Date().toISOString(),
      },
    }));

  return (
    <Card title={t("settings.rates.title")} subtitle={t("settings.rates.subtitle")} icon="exchange">
      <div className="grid gap-4 sm:grid-cols-3">
        {FOREIGN_CURRENCIES.map((c) => (
          <NumericSetting
            key={c}
            label={`${c} → UAH`}
            hint={
              meta?.[c]
                ? t("settings.rates.buySell", { buy: meta[c].buy, sell: meta[c].sell })
                : t("settings.rates.per", { symbol: CURRENCY_SYMBOL[c] })
            }
            value={settings.rates[c]}
            isValid={(v) => v > 0}
            onCommit={(v) => setRate(c, v)}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-3">
        <Icon name="refresh" size={14} className="shrink-0" />
        <span>{ratesOrigin(settings, t)}</span>
        <span aria-hidden>·</span>
        <span>{t("prices.nextUpdate", { time: nextHourLabel() })}</span>
      </div>
      <p className="mt-2 text-xs text-ink-3">{t("settings.rates.explain")}</p>
    </Card>
  );
}
