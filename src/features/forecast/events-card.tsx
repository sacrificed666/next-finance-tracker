"use client";

import { useState } from "react";
import { Button, Card, Icon, MonthInput, SegmentedControl, TextInput } from "@/components/ui";
import { CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import { addMonths, formatMonthCompact } from "@/lib/date";
import { convert, formatMoney, parseAmount } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { uid } from "@/lib/state/store";
import type { Currency } from "@/lib/types";
import type { PlannedEvent } from "@/lib/types";
import type { Forecast } from "./use-forecast";

const positive = (s: string) => {
  const v = parseAmount(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** One-off inflows and outflows the projection should account for. */
export function EventsCard({
  f,
  view,
  events,
  setEvents,
}: {
  f: Forecast;
  view: Currency;
  events: PlannedEvent[];
  setEvents: (events: PlannedEvent[]) => void;
}) {
  const { t } = useT();
  const currencies = displayCurrencies(f.state);
  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));
  const [draft, setDraft] = useState<{
    month: string;
    amount: string;
    note: string;
    sign: "out" | "in";
    currency: Currency;
  }>({ month: addMonths(f.startMonth, 6), amount: "", note: "", sign: "out", currency: f.base });

  const addEvent = () => {
    const amount = positive(draft.amount);
    if (amount <= 0) return;
    setEvents([
      ...events,
      {
        id: uid(),
        month: draft.month,
        amount: draft.sign === "out" ? -amount : amount,
        currency: draft.currency,
        note: draft.note.trim(),
      },
    ]);
    setDraft({ ...draft, amount: "", note: "" });
  };

  return (
    <Card title={t("forecast.events")} subtitle={t("forecast.events.subtitle")} icon="calendar">
      {events.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {[...events]
            .sort((a, b) => a.month.localeCompare(b.month))
            .map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-field bg-ghost px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-1">{e.note || t("forecast.events.unnamed")}</span>
                  <span className="caption">{formatMonthCompact(e.month)}</span>
                </span>
                <span className={`tnum shrink-0 text-sm font-semibold ${e.amount < 0 ? "text-expense" : "text-income"}`}>
                  {formatMoney(convert(e.amount, e.currency, view, f.settings.rates), view, { compact: true, sign: true })}
                </span>
                <button
                  type="button"
                  onClick={() => setEvents(events.filter((x) => x.id !== e.id))}
                  aria-label={t("forecast.events.remove")}
                  className="icon-btn icon-btn-danger size-8 shrink-0 text-ink-3"
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
        </ul>
      )}
      <div className="space-y-3">
        <div className="space-y-2">
          <SegmentedControl
            size="sm"
            label={t("forecast.events.direction")}
            options={[
              { value: "out" as const, label: t("forecast.events.out") },
              { value: "in" as const, label: t("forecast.events.in") },
            ]}
            value={draft.sign}
            onChange={(sign) => setDraft({ ...draft, sign })}
          />
          {currencies.length > 1 && (
            <SegmentedControl
              size="sm"
              label={t("common.currency")}
              options={currencyOptions}
              value={draft.currency}
              onChange={(currency) => setDraft({ ...draft, currency })}
            />
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <TextInput
            inputMode="decimal"
            prefix={CURRENCY_SYMBOL[draft.currency]}
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            placeholder="0"
            aria-label={t("common.amount")}
          />
          <TextInput
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder={t("forecast.events.notePlaceholder")}
            aria-label={t("common.note")}
            maxLength={60}
          />
        </div>
        <MonthInput name={t("forecast.events.month")} value={draft.month} onChange={(month) => setDraft({ ...draft, month })} />
        <Button variant="ghost" onClick={addEvent} disabled={positive(draft.amount) <= 0}>
          <Icon name="plus" size={14} />
          {t("forecast.events.add")}
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-3">{t("forecast.events.note")}</p>
    </Card>
  );
}
