"use client";

import { HeroSplit } from "@/components/charts";
import { PageHero, type HeroStat } from "@/components/layout/hero";
import { accountColorSlot, accountKind, displayCurrencies } from "@/lib/constants";
import { addMonths, currentMonth, dateInMonth, todayISO } from "@/lib/date";
import { gamification } from "@/lib/finance/achievements";
import { accountBalances, netWorth } from "@/lib/finance/finmath";
import { convert, formatMoney, formatNumber, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { AccountKind } from "@/lib/types";
import { goalsSummary } from "./helpers";

/** What sits in accounts, split by type, with net worth, the emergency fund, goals and debts underneath. */
export function AccountsHero() {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const worth = netWorth(state, today);
  const monthAgo = netWorth(state, dateInMonth(addMonths(currentMonth(), -1), Number(today.slice(8))));
  const delta = worth.savings - monthAgo.savings;

  const balances = accountBalances(state, today);
  const byKind = new Map<AccountKind, number>();
  for (const acc of state.savings) {
    const value = convert(Math.max(0, balances.get(acc.id) ?? 0), acc.currency, base, settings.rates);
    if (value > 0) byKind.set(acc.kind, (byKind.get(acc.kind) ?? 0) + value);
  }

  // The same cushion the health score measures: cash in full, crypto and liquid investments at half.
  const { facts } = gamification(state);
  const months = facts.emergencyMonths;
  const cushionNote =
    months >= 6 ? t("accounts.cushion.solid") : months >= 3 ? t("accounts.cushion.ok") : t("accounts.cushion.low");
  const goals = goalsSummary(state, today);

  const stats: HeroStat[] = [
    {
      label: t("balance.netWorth"),
      icon: "wallet",
      value: formatMoney(worth.total, base, { compact: true }),
      hint: t("accounts.withInvestments", { amount: formatMoney(worth.investments, base, { compact: true }) }),
    },
    {
      label: t("health.part.cushion"),
      icon: "shield",
      value: facts.avgExpenseUAH > 0 ? t("profile.health.months", { n: formatNumber(months, 1) }) : "—",
      delta: facts.avgExpenseUAH > 0 ? { text: cushionNote, good: months >= 3 } : undefined,
      hint:
        facts.avgExpenseUAH > 0
          ? t("accounts.cushion.hint", {
              spend: formatMoney(convert(facts.avgExpenseUAH, "UAH", base, settings.rates), base, { compact: true }),
            })
          : t("accounts.cushion.noSpend"),
    },
  ];
  if (goals.goals.length > 0) {
    stats.push({
      label: t("balance.goals"),
      icon: "target",
      value: formatPercent((goals.haveTotal / goals.targetTotal) * 100, 0),
      hint: t("accounts.goals.hint", {
        have: formatMoney(goals.haveTotal, base, { compact: true }),
        target: formatMoney(goals.targetTotal, base, { compact: true }),
      }),
    });
  }
  stats.push({
    label: t("balance.debts"),
    icon: "debt",
    value: worth.debts > 0 ? `−${formatMoney(worth.debts, base, { compact: true })}` : formatMoney(0, base),
    tone: worth.debts > 0 ? "expense" : undefined,
    hint:
      worth.debts > 0
        ? worth.assets > 0
          ? t("accounts.debts.share", { pct: formatPercent((worth.debts / worth.assets) * 100, 0) })
          : undefined
        : t("accounts.debts.none"),
  });

  return (
    <PageHero
      icon="bank"
      label={t("balance.accounts")}
      value={formatMoney(worth.savings, base)}
      sub={displayCurrencies(state)
        .filter((c) => c !== base)
        .map((c) => formatMoney(convert(worth.savings, base, c, settings.rates), c, { exact: true }))
        .join("  ·  ")}
      delta={
        monthAgo.savings !== 0 && Math.abs(delta) >= 0.5
          ? {
              text: t("accounts.inAMonth", { amount: formatMoney(delta, base, { compact: true, sign: true }) }),
              good: delta >= 0,
            }
          : undefined
      }
      note={tp("dash.accountsCount", state.savings.length)}
      aside={
        byKind.size > 0 ? (
          <HeroSplit
            title={t("accounts.byType")}
            segments={[...byKind.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([kind, value]) => ({
                id: kind,
                label: t(`accountKind.${kind}`),
                icon: accountKind(kind).icon,
                value,
                colorSlot: accountColorSlot(kind),
              }))}
            currency={base}
          />
        ) : undefined
      }
      stats={stats}
    />
  );
}
