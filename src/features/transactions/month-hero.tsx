"use client";

import { HeroTrend } from "@/components/charts";
import { PageHero, type HeroStat } from "@/components/layout/hero";
import { addMonths, currentMonth, daysInMonth, formatMonthShort, monthOf, todayISO } from "@/lib/date";
import { budgetLimit, spentInBudget } from "@/lib/finance/categories";
import { monthlySeries, monthTotals } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent, ratesAt } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { MonthSwitcher } from "./month-switcher";

export function MonthHero({
  month,
  switcherMonth = month,
  onMonthChange,
}: {
  month: string;
  switcherMonth?: string;
  onMonthChange: (month: string) => void;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();

  const totals = monthTotals(state.transactions, month, settings);
  const prev = monthTotals(state.transactions, addMonths(month, -1), settings);
  const hasPrev = prev.income > 0 || prev.expense > 0;
  const year = monthlySeries(state.transactions, month, 12, settings);
  const spendingMonths = year.filter((m) => m.expense > 0);
  const avgSpend = spendingMonths.reduce((sum, m) => sum + m.expense, 0) / Math.max(1, spendingMonths.length);

  const vsLast = (now: number, before: number, lowerIsBetter = false) =>
    hasPrev
      ? {
          text: t("tx.vsLastMonth", { delta: formatMoney(now - before, base, { compact: true, sign: true }) }),
          good: lowerIsBetter ? now <= before : now >= before,
        }
      : undefined;
  const plannedIn = (type: "income" | "expense") =>
    state.transactions
      .filter((tx) => tx.type === type && monthOf(tx.date) === month && tx.date > today)
      .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, ratesAt(settings, tx.date)), 0);
  const stillAhead = (total: number, ahead: number) =>
    ahead > 0
      ? t("tx.soFarPlanned", {
          soFar: formatMoney(total - ahead, base, { compact: true }),
          planned: formatMoney(ahead, base, { compact: true }),
        })
      : undefined;

  const isCurrent = month === currentMonth();
  const elapsed = isCurrent ? Number(today.slice(8)) : daysInMonth(month);
  const spentSoFar = totals.expense - (isCurrent ? plannedIn("expense") : 0);
  const perDay = spentSoFar / elapsed;
  const prevPerDay = prev.expense / daysInMonth(addMonths(month, -1));
  const expenseCount = state.transactions.filter((tx) => tx.type === "expense" && monthOf(tx.date) === month).length;

  const budget = state.budgets.reduce(
    (acc, b) => {
      const limit = budgetLimit(state, b, month);
      const spent = spentInBudget(state, b.categoryId, b.currency, month);
      acc.limit += convert(limit, b.currency, base, settings.rates);
      acc.spent += convert(spent, b.currency, base, settings.rates);
      acc.over += spent > limit ? 1 : 0;
      return acc;
    },
    { limit: 0, spent: 0, over: 0 },
  );
  const budgetLeft = budget.limit - budget.spent;

  const stats: HeroStat[] = [
    {
      label: t("tx.stat.income"),
      icon: "arrowDown",
      href: "/income",
      value: formatMoney(totals.income, base, { compact: true }),
      tone: "income",
      delta: vsLast(totals.income, prev.income),
      hint: stillAhead(totals.income, plannedIn("income")),
    },
    {
      label: t("tx.stat.net"),
      icon: "exchange",
      value: formatMoney(totals.net, base, { sign: true, compact: true }),
      tone: totals.net < 0 ? "expense" : "income",
      delta: vsLast(totals.net, prev.net),
      hint:
        totals.income > 0 && totals.net > 0
          ? t("tx.stat.kept", { pct: formatPercent((totals.net / totals.income) * 100, 0) })
          : undefined,
    },
    {
      label: t("tx.stat.daily"),
      icon: "calendar",
      value: formatMoney(perDay, base, { compact: true }),
      delta:
        hasPrev && prev.expense > 0
          ? {
              text: t("tx.vsLastMonth", { delta: formatMoney(perDay - prevPerDay, base, { compact: true, sign: true }) }),
              good: perDay <= prevPerDay,
            }
          : undefined,
      hint:
        isCurrent && spentSoFar > 0
          ? t("tx.stat.pace", { amount: formatMoney(perDay * daysInMonth(month), base, { compact: true }) })
          : undefined,
    },
  ];
  if (state.budgets.length > 0) {
    stats.push({
      label: t("tx.stat.budgetLeft"),
      icon: "target",
      value: `${budgetLeft < 0 ? "−" : ""}${formatMoney(Math.abs(budgetLeft), base, { compact: true })}`,
      tone: budgetLeft < 0 ? "expense" : undefined,
      delta:
        budget.over > 0 ? { text: tp("dash.budgets.overCount", budget.over), good: false } : undefined,
      hint: t("tx.budgets.of", {
        spent: formatMoney(budget.spent, base, { compact: true }),
        limit: formatMoney(budget.limit, base, { compact: true }),
      }),
    });
  }

  return (
    <PageHero
      icon="spend"
      label={t("tx.stat.expenses")}
      action={<MonthSwitcher month={switcherMonth} onChange={onMonthChange} />}
      value={formatMoney(totals.expense, base)}
      sub={
        stillAhead(totals.expense, plannedIn("expense")) ??
        (totals.income > 0
          ? t("tx.stat.ofIncome", { pct: formatPercent((totals.expense / totals.income) * 100, 0) })
          : undefined)
      }
      delta={vsLast(totals.expense, prev.expense, true)}
      note={tp("common.entries", expenseCount)}
      aside={
        spendingMonths.length > 1 ? (
          <HeroTrend
            title={t("common.last12")}
            summary={t("income.perMonthAvg", { amount: formatMoney(avgSpend, base, { compact: true }) })}
            values={year.map((m) => m.expense)}
            tone="expense"
            from={formatMonthShort(year[0].month)}
            to={formatMonthShort(month)}
          />
        ) : undefined
      }
      stats={stats}
    />
  );
}
