"use client";

import { HeroSplit, HeroTrend } from "@/components/charts";
import { PageHero } from "@/components/layout/hero";
import { displayCurrencies } from "@/lib/constants";
import { addMonths, formatMonthShort, monthOf } from "@/lib/date";
import { netWorth, netWorthByKind } from "@/lib/finance/finmath";
import { worthHistory } from "@/lib/finance/history";
import { convert, formatMoney, formatNumber, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { AccountKind, InvestmentKind } from "@/lib/types";
import { useMonthSummary } from "./use-month-summary";

const savingsRate = (m: { income: number; net: number }) => (m.income > 0 ? (m.net / m.income) * 100 : 0);

export function DashboardHero() {
  const { state, settings, base, month, today, series, current, previous, hasPrevious, vsLast } = useMonthSummary();
  const { t } = useT();

  const worth = netWorth(state, today);
  const trend = worthHistory(state, today);
  const monthAgo = trend[10];
  const monthDelta = worth.total - monthAgo;
  const monthPct = monthAgo > 0 ? (monthDelta / monthAgo) * 100 : 0;
  const yearDelta = worth.total - trend[0];
  const trendMoves = trend.some((v) => v !== trend[0]);

  const kindLabel = (id: string) => {
    const [family, value] = id.split(":");
    return family === "acc" ? t(`accountKind.${value as AccountKind}`) : t(`investmentKind.${value as InvestmentKind}`);
  };

  const planned = (type: "income" | "expense") =>
    state.transactions
      .filter((tx) => tx.type === type && monthOf(tx.date) === month && tx.date > today)
      .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);
  const soFar = (total: number, ahead: number) =>
    ahead > 0
      ? t("tx.soFarPlanned", {
          soFar: formatMoney(total - ahead, base, { compact: true }),
          planned: formatMoney(ahead, base, { compact: true }),
        })
      : undefined;
  const rateDelta = savingsRate(current) - savingsRate(previous);
  const active = series.filter((m) => m.income > 0 || m.expense > 0).slice(-6);
  const keptAvg = active.reduce((sum, m) => sum + m.net, 0) / Math.max(1, active.length);

  return (
    <PageHero
      icon="wallet"
      label={t("balance.netWorth")}
      value={formatMoney(worth.total, base)}
      sub={displayCurrencies(state)
        .filter((c) => c !== base)
        .map((c) => formatMoney(convert(worth.total, base, c, settings.rates), c, { exact: true }))
        .join("  ·  ")}
      delta={
        monthAgo !== 0 && monthDelta !== 0
          ? {
              text: `${formatMoney(monthDelta, base, { compact: true, sign: true })} ${t("dash.inAMonth", {
                pct: `${monthDelta >= 0 ? "+" : "−"}${formatPercent(Math.abs(monthPct))}`,
              })}`,
              good: monthDelta >= 0,
            }
          : undefined
      }
      note={
        worth.debts > 0
          ? t("hero.debtsIncluded", { amount: formatMoney(worth.debts, base, { compact: true }) })
          : undefined
      }
      aside={
        trendMoves ? (
          <HeroTrend
            title={t("common.last12")}
            summary={
              <span className={yearDelta >= 0 ? "text-income" : "text-expense"}>
                {formatMoney(yearDelta, base, { compact: true, sign: true })}
              </span>
            }
            values={trend}
            tone={yearDelta >= 0 ? "income" : "expense"}
            from={formatMonthShort(addMonths(month, -11))}
            to={formatMonthShort(month)}
          />
        ) : (
          <HeroSplit
            title={t("hero.madeOf")}
            segments={netWorthByKind(state, today).map((row) => ({
              id: row.id,
              label: kindLabel(row.id),
              icon: row.icon,
              value: row.base,
              colorSlot: row.colorSlot,
            }))}
            currency={base}
          />
        )
      }
      stats={[
        {
          label: t("tx.stat.income"),
          icon: "arrowDown",
          href: "/income",
          value: formatMoney(current.income, base, { compact: true }),
          tone: "income",
          delta: hasPrevious
            ? { text: vsLast(current.income - previous.income), good: current.income >= previous.income }
            : undefined,
          hint: soFar(current.income, planned("income")),
        },
        {
          label: t("tx.stat.expenses"),
          icon: "spend",
          href: "/transactions",
          value: formatMoney(current.expense, base, { compact: true }),
          tone: "expense",
          delta: hasPrevious
            ? { text: vsLast(current.expense - previous.expense), good: current.expense <= previous.expense }
            : undefined,
          hint: soFar(current.expense, planned("expense")),
        },
        {
          label: t("dash.netFlow"),
          icon: "exchange",
          value: formatMoney(current.net, base, { compact: true, sign: true }),
          tone: current.net < 0 ? "expense" : "income",
          delta: hasPrevious ? { text: vsLast(current.net - previous.net), good: current.net >= previous.net } : undefined,
        },
        {
          label: t("dash.savingsRate"),
          icon: "percent",
          value: current.income > 0 ? formatPercent(savingsRate(current)) : "—",
          delta:
            current.income > 0 && previous.income > 0 && hasPrevious
              ? {
                  text: t("dash.ppVsLast", { delta: `${rateDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(rateDelta), 1)}` }),
                  good: rateDelta >= 0,
                }
              : undefined,
          hint: active.length > 0 ? t("dash.keptAvg", { amount: formatMoney(keptAvg, base, { compact: true }) }) : undefined,
        },
      ]}
    />
  );
}
