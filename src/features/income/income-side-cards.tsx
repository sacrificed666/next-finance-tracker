"use client";

import { useState } from "react";
import { CategoryBreakdown, type BreakdownSegment } from "@/components/charts";
import { Card, EmptyState, Icon, ProgressMeter, SegmentedControl, SummaryPanel } from "@/components/ui";
import { CURRENCIES, CURRENCY_SLOT, CURRENCY_SYMBOL } from "@/lib/constants";
import { addMonths, currentMonth, monthOf, todayISO } from "@/lib/date";
import { incomeByCategory, rollupToParents } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { regimeAnnualHeadroom, taxRegime, taxYearValues } from "@/lib/finance/tax";
import { useT, type MessageKey } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { TaxRegimeId } from "@/lib/types";

export function TaxLimitCard() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const today = todayISO();
  const nowMonth = currentMonth();
  const yearStart = `${nowMonth.slice(0, 4)}-01`;

  const grossByRegime = new Map<TaxRegimeId, number>();
  for (const tx of state.transactions) {
    if (tx.type !== "income" || !tx.tax || tx.date > today || monthOf(tx.date) < yearStart) continue;
    const regime: TaxRegimeId = tx.tax.regime ?? "custom";
    const gross = convert(tx.tax.gross, tx.currency, "UAH", settings.rates);
    grossByRegime.set(regime, (grossByRegime.get(regime) ?? 0) + gross);
  }
  const limits = [...grossByRegime.entries()]
    .map(([regime, gross]) => ({ regime, headroom: regimeAnnualHeadroom(regime, gross) }))
    .filter((row): row is { regime: TaxRegimeId; headroom: NonNullable<typeof row.headroom> } => row.headroom !== null)
    .sort((a, b) => b.headroom.pct - a.headroom.pct);

  if (limits.length === 0) return null;
  const figures = taxYearValues(Number(nowMonth.slice(0, 4)));

  return (
    <Card title={t("tax.limit.title", { year: nowMonth.slice(0, 4) })} subtitle={tp("tax.limit.regimes", limits.length)} icon="shield">
      {!figures.known && (
        <p className="caption mb-3 text-warning">{t("tax.yearUnknown", { year: nowMonth.slice(0, 4), used: figures.year })}</p>
      )}
      <ul className="space-y-3.5">
        {limits.map(({ regime, headroom }) => (
          <li key={regime}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium text-ink-1">{t(taxRegime(regime).shortKey as MessageKey)}</span>
              <span className="tnum text-xs text-ink-3">
                {formatMoney(headroom.used, "UAH", { compact: true })}{" "}
                {t("tax.limit.of", { limit: formatMoney(headroom.limit, "UAH", { compact: true }) })}
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressMeter
                value={headroom.used}
                max={headroom.limit}
                tone="budget"
                label={t(taxRegime(regime).shortKey as MessageKey)}
              />
            </div>
            <p className={`tnum mt-1 text-xs ${headroom.pct >= 90 ? "text-warning" : "text-ink-3"}`}>
              {t("tax.limit.left", {
                pct: formatPercent(headroom.pct),
                left: formatMoney(headroom.remaining, "UAH", { compact: true }),
              })}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function IncomeSourcesCard() {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();
  const today = todayISO();
  const trailingStart = addMonths(nowMonth, -11);
  const [view, setView] = useState<"source" | "currency">("source");

  const byCategory = rollupToParents(incomeByCategory(state.transactions, trailingStart, nowMonth, settings), state.categories);
  const total = [...byCategory.values()].reduce((s, v) => s + v, 0);
  const sources: BreakdownSegment[] = [...byCategory.entries()].map(([categoryId, value]) => {
    const cat = state.categories.find((c) => c.id === categoryId);
    return { id: categoryId, label: category(cat), icon: cat?.icon ?? "💰", value, colorSlot: cat?.colorSlot ?? 3 };
  });

  const byCurrency = CURRENCIES.map((currency) => {
    const native = state.transactions
      .filter((tx) => tx.type === "income" && tx.currency === currency && tx.date <= today && monthOf(tx.date) >= trailingStart)
      .reduce((sum, tx) => sum + tx.amount, 0);
    return { currency, native, base: convert(native, currency, base, settings.rates) };
  }).filter((c) => c.native > 0);
  const currencies: BreakdownSegment[] = byCurrency.map((c) => ({
    id: c.currency,
    label: c.currency,
    icon: CURRENCY_SYMBOL[c.currency],
    value: c.base,
    colorSlot: CURRENCY_SLOT[c.currency],
  }));
  const showCurrency = view === "currency" && byCurrency.length > 1;
  const native = (id: string) => {
    const row = byCurrency.find((c) => c.currency === id);
    if (!showCurrency || !row || row.currency === base) return null;
    return <p className="caption tnum mt-0.5 pl-12">{formatMoney(row.native, row.currency)}</p>;
  };

  return (
    <Card
      title={t("income.bySource")}
      subtitle={t("common.last12")}
      icon="pie"
      action={
        byCurrency.length > 1 ? (
          <SegmentedControl
            size="sm"
            label={t("income.bySource")}
            options={[
              { value: "source" as const, label: t("income.source") },
              { value: "currency" as const, label: t("common.currency") },
            ]}
            value={view}
            onChange={setView}
          />
        ) : undefined
      }
    >
      {sources.length > 0 ? (
        <>
          <SummaryPanel
            className="mb-3"
            value={formatMoney(total, base, { compact: true })}
            meta={`${tp("income.sources", sources.length)} · ${t("income.perMonthAvg", {
              amount: formatMoney(total / 12, base, { compact: true }),
            })}`}
          />
          <CategoryBreakdown segments={showCurrency ? currencies : sources} currency={base} maxSegments={7} rowExtra={native} />
        </>
      ) : (
        <EmptyState icon={<Icon name="pie" />} title={t("income.empty.sources")} hint={t("income.empty.sources.hint")} />
      )}
    </Card>
  );
}
