"use client";

import { HeroTrend } from "@/components/charts";
import { PageHero } from "@/components/layout/hero";
import { currentMonth, formatMonthShort, monthOf, todayISO } from "@/lib/date";
import { monthlySeries, taxPaid } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import { useT } from "@/lib/i18n";

export function IncomeHero() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();
  const today = todayISO();
  const year = nowMonth.slice(0, 4);

  const series = monthlySeries(state.transactions, nowMonth, 12, settings);
  const thisMonth = series[series.length - 1].income;
  const withIncome = series.filter((m) => m.income > 0).slice(-6);
  const avg6 = withIncome.reduce((s, m) => s + m.income, 0) / Math.max(1, withIncome.length);
  const ytdMonths = series.filter((m) => m.month.slice(0, 4) === year);
  const ytd = ytdMonths.reduce((s, m) => s + m.income, 0);
  const monthsSoFar = Math.max(1, ytdMonths.length);
  const bestMonth = series.reduce<(typeof series)[number] | null>(
    (best, m) => (m.income > 0 && (!best || m.income > best.income) ? m : best),
    null,
  );
  const tax = taxPaid(state.transactions, `${year}-01`, nowMonth, settings);

  const planned = state.transactions.filter((tx) => tx.type === "income" && tx.date > today);
  const plannedTotal = planned.reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);
  const plannedThisMonth = planned
    .filter((tx) => monthOf(tx.date) === nowMonth)
    .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);

  return (
    <PageHero
      icon="arrowDown"
      label={t("income.thisMonth")}
      value={formatMoney(thisMonth, base)}
      sub={
        plannedThisMonth > 0
          ? t("tx.soFarPlanned", {
              soFar: formatMoney(thisMonth - plannedThisMonth, base, { compact: true }),
              planned: formatMoney(plannedThisMonth, base, { compact: true }),
            })
          : undefined
      }
      delta={
        withIncome.length > 0
          ? {
              text: t("income.vsAverage", { delta: formatMoney(thisMonth - avg6, base, { compact: true, sign: true }) }),
              good: thisMonth >= avg6,
            }
          : undefined
      }
      aside={
        withIncome.length > 1 ? (
          <HeroTrend
            title={t("common.last12")}
            summary={
              bestMonth
                ? t("income.best", {
                    amount: formatMoney(bestMonth.income, base, { compact: true }),
                    month: formatMonthShort(bestMonth.month),
                  })
                : undefined
            }
            values={series.map((m) => m.income)}
            tone="income"
            from={formatMonthShort(series[0].month)}
            to={formatMonthShort(nowMonth)}
          />
        ) : undefined
      }
      stats={[
        {
          label: t("income.average6"),
          icon: "chart",
          value: formatMoney(avg6, base, { compact: true }),
        },
        {
          label: t("income.ytd", { year }),
          icon: "calendar",
          value: formatMoney(ytd, base, { compact: true }),
          hint: tp("income.ytdHint", monthsSoFar, { amount: formatMoney(ytd / monthsSoFar, base, { compact: true }) }),
        },
        {
          label: t("income.taxYear", { year }),
          icon: "receipt",
          value: tax.entries > 0 ? formatMoney(tax.tax, base, { compact: true }) : "—",
          tone: tax.entries > 0 ? "expense" : undefined,
          hint:
            tax.entries > 0
              ? [
                  t("income.taxHint", {
                    pct: formatPercent((tax.tax / Math.max(1, tax.gross - tax.vat)) * 100),
                    gross: formatMoney(tax.gross, base, { compact: true }),
                  }),
                  tp("income.taxedEntries", tax.entries),
                  tax.vat > 0 ? t("income.vatHint", { vat: formatMoney(tax.vat, base, { compact: true }) }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("income.noTaxYet"),
        },
        {
          label: t("income.plannedAhead"),
          icon: "repeat",
          value: plannedTotal > 0 ? formatMoney(plannedTotal, base, { compact: true }) : "—",
          hint: planned.length > 0 ? tp("common.entries", planned.length) : undefined,
        },
      ]}
    />
  );
}
