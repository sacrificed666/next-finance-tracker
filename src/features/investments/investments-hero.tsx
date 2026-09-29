"use client";

import { HeroTrend } from "@/components/charts";
import { PageHero } from "@/components/layout/hero";
import { displayCurrencies } from "@/lib/constants";
import { addMonths, currentMonth, dateInMonth, formatMonthShort, todayISO } from "@/lib/date";
import { projectedSnapshot } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { oneYearFrom, positionReturns } from "./helpers";

export function InvestmentsHero() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const month = currentMonth();
  const yearOut = oneYearFrom(today);

  const totals = state.investments.reduce(
    (acc, inv) => {
      const r = positionReturns(inv, today, yearOut);
      const to = (n: number) => convert(n, inv.currency, base, settings.rates);
      acc.invested += to(r.snap.invested);
      acc.value += to(r.snap.value);
      acc.earned += to(r.earned);
      acc.nextYear += to(r.nextYear);
      acc.capital += to(r.averageCapital);
      acc.paidOut += to(r.snap.paidOut);
      return acc;
    },
    { invested: 0, value: 0, earned: 0, nextYear: 0, capital: 0, paidOut: 0 },
  );

  const day = Number(today.slice(8));
  const ahead = Array.from({ length: 13 }, (_, i) =>
    state.investments.reduce((sum, inv) => {
      const at = i === 0 ? today : dateInMonth(addMonths(month, i), day);
      const p = projectedSnapshot(inv, today, at);
      return sum + convert(p.value + p.paidOut, inv.currency, base, settings.rates);
    }, 0),
  );
  const topUps = state.investments
    .filter((inv) => !inv.endDate || inv.endDate > today)
    .reduce((sum, inv) => sum + convert(inv.monthlyContribution ?? 0, inv.currency, base, settings.rates), 0);

  return (
    <PageHero
      icon="banknote"
      label={t("balance.inv.currentValue")}
      value={formatMoney(totals.value, base)}
      sub={displayCurrencies(state)
        .filter((c) => c !== base)
        .map((c) => formatMoney(convert(totals.value, base, c, settings.rates), c, { exact: true }))
        .join("  ·  ")}
      delta={
        totals.invested > 0
          ? {
              text: t("balance.inv.onPrincipal", { pct: formatPercent((totals.value / totals.invested - 1) * 100) }),
              good: totals.value >= totals.invested,
            }
          : undefined
      }
      note={tp("balance.inv.positions", state.investments.length)}
      aside={
        <HeroTrend
          title={t("investments.nextYear")}
          summary={t(topUps > 0 ? "investments.hero.inYearTopUps" : "investments.hero.inYear", {
            amount: formatMoney(ahead[12], base, { compact: true }),
          })}
          values={ahead}
          tone="income"
          from={t("forecast.now")}
          to={formatMonthShort(addMonths(month, 12))}
        />
      }
      stats={[
        {
          label: t("balance.inv.invested"),
          icon: "arrowDown",
          value: formatMoney(totals.invested, base, { compact: true }),
          hint: topUps > 0 ? t("investments.hero.topUps", { amount: formatMoney(topUps, base, { compact: true }) }) : undefined,
        },
        {
          label: t("balance.inv.earned"),
          icon: "trend",
          value: formatMoney(totals.earned, base, { compact: true, sign: true }),
          tone: totals.earned > 0 ? "income" : totals.earned < 0 ? "expense" : undefined,
          hint:
            totals.earned > 0
              ? totals.paidOut > 0.5
                ? t("investments.hero.paidOut", { amount: formatMoney(totals.paidOut, base, { compact: true }) })
                : t("investments.hero.atWork")
              : undefined,
        },
        {
          label: t("investments.nextYear"),
          icon: "calendar",
          value: totals.nextYear !== 0 ? formatMoney(totals.nextYear, base, { compact: true, sign: true }) : "—",
          tone: totals.nextYear > 0 ? "income" : undefined,
          delta:
            totals.capital > 0 && totals.nextYear !== 0
              ? {
                  text: t("balance.perYear", { pct: formatPercent((totals.nextYear / totals.capital) * 100) }),
                  good: totals.nextYear >= 0,
                }
              : undefined,
          hint:
            totals.nextYear !== 0
              ? t("investments.nextYear.hint", { amount: formatMoney(totals.nextYear / 12, base, { compact: true }) })
              : t("balance.inv.marketNotProjected"),
        },
      ]}
    />
  );
}
