"use client";

import { Donut, type BreakdownSegment } from "@/components/charts";
import { Card, EmptyState, Icon } from "@/components/ui";
import { CURRENCY_SLOT, CURRENCY_SYMBOL, displayCurrencies } from "@/lib/constants";
import { currencyAllocation } from "@/lib/finance/finmath";
import { formatMoney, formatNumber } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useMonthSummary } from "./use-month-summary";

export function CurrencyCard({ className = "" }: { className?: string }) {
  const { state, settings, base, today } = useMonthSummary();
  const { t } = useT();
  const allocation = currencyAllocation(state, today);
  const segments: BreakdownSegment[] = allocation
    .filter((a) => a.base > 0)
    .map((a) => ({
      id: a.currency,
      label: a.currency,
      icon: CURRENCY_SYMBOL[a.currency],
      value: a.base,
      colorSlot: CURRENCY_SLOT[a.currency],
    }));

  return (
    <Card title={t("dash.currency")} icon="globe" className={className}>
      {segments.length > 0 ? (
        <>
          <Donut segments={segments} currency={base} centerLabel={t("dash.currency.center")} legend={false} size={160} />
          <ul className="rows mt-4">
            {allocation
              .filter((a) => a.native !== 0)
              .map((a) => (
                <li key={a.currency} className="flex items-baseline justify-between gap-3 px-2.5 py-2">
                  <span className="flex items-center gap-2 text-sm text-ink-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: `var(--series-${CURRENCY_SLOT[a.currency]})` }}
                    />
                    {a.currency}
                  </span>
                  <span className="min-w-0 text-right">
                    <span className="tnum block text-sm font-semibold text-ink-1">
                      {formatMoney(a.native, a.currency, { exact: true })}
                    </span>
                    {a.currency !== base && (
                      <span className="tnum block text-xs text-ink-3">{formatMoney(a.base, base, { compact: true })}</span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-2 flex items-center gap-2 px-1 text-xs text-ink-3">
            <Icon name="exchange" size={13} className="shrink-0" />
            {displayCurrencies(state)
              .filter((c) => c !== "UAH")
              .map((c) => `1 ${CURRENCY_SYMBOL[c]} = ${formatNumber(settings.rates[c as "USD" | "EUR"], 2)} ₴`)
              .join(" · ")}
          </p>
        </>
      ) : (
        <EmptyState icon={<Icon name="exchange" />} title={t("dash.currency.empty")} hint={t("dash.currency.empty.hint")} />
      )}
    </Card>
  );
}
