"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  CategoryBreakdown,
  Donut,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import {
  Button,
  EmptyState,
  Field,
  FieldSet,
  GlassCard,
  IconDisc,
  LinkButton,
  Money,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  TextInput,
} from "@/components/ui";
import {
  categoryTree,
  descendantsOf,
  useAccountGroups,
  useCategoryGroups,
} from "@/components/category-select";
import { OptionPicker } from "@/components/picker";
import { Icon } from "@/components/icons";
import { CURRENCY_SYMBOL, displayCurrencies, SUBSCRIPTION_SLOT } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  dateInMonth,
  formatDateShort,
  formatMonth,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  currencyAllocation,
  expensesByCategory,
  holdings,
  netWorthByKind,
  monthlySeries,
  netWorth,
  rollupToParents,
  spentInCategory,
  subscriptionBillsIn,
  subscriptionsMonthlyTotal,
} from "@/lib/finmath";
import { gamification } from "@/lib/achievements";
import { convert, formatMoney, formatNumber, formatPercent, parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { AccountKind, Currency, InvestmentKind, TxType } from "@/lib/types";

const CURRENCY_SLOT: Record<Currency, number> = { UAH: 1, USD: 2, EUR: 3 };

function CardLink({ href }: { href: string }) {
  const { t } = useT();
  return (
    <Link
      href={href}
      className="glass-el group inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline px-3 text-xs font-semibold text-ink-2 transition-[background-color,border-color,box-shadow,color] duration-150 hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-fill-hover hover:text-ink-1"
    >
      {t("dash.all")}
      <Icon name="arrowRight" size={13} strokeWidth={2.4} className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

function WorthGroup({
  label,
  total,
  rows,
  base,
}: {
  label: string;
  total: number;
  rows: Array<{ id: string; label: string; colorSlot: number; base: number }>;
  base: Currency;
}) {
  const { t } = useT();
  if (rows.length === 0) return null;
  const groupTotal = rows.reduce((sum, r) => sum + r.base, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-2">{label}</span>
        <Money amount={total} currency={base} className="font-semibold text-ink-1" />
      </div>
      <div
        className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={t("dash.byKind", { label })}
      >
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="bar-slice"
            title={`${row.label}: ${formatMoney(row.base, base, { compact: true })}`}
            style={
              {
                width: `${(row.base / groupTotal) * 100}%`,
                background: `var(--series-${row.colorSlot})`,
                "--i": i,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 text-[13px]">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: `var(--series-${row.colorSlot})` }} />
            <span className="min-w-0 flex-1 truncate text-ink-3">{row.label}</span>
            <span className="tnum text-ink-2">{formatMoney(row.base, base, { compact: true })}</span>
            <span className="tnum w-8 shrink-0 text-right text-ink-3">
              {formatPercent((row.base / groupTotal) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgressCard({ className = "" }: { className?: string }) {
  const { state } = useStore();
  const { t, tk } = useT();
  const g = gamification(state);
  const unlocked = g.achievements.filter((a) => a.unlocked).length;
  const nextUp = g.achievements
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.progress - a.progress)[0];
  const tone =
    g.health.grade === "excellent" || g.health.grade === "good"
      ? "text-income"
      : g.health.grade === "fair"
        ? "text-warning"
        : "text-expense";
  return (
    <GlassCard
      title={t("dash.progress")}
      icon="trophy"
      action={
        <Link
          href="/profile"
          className="glass-el inline-flex min-h-9 items-center gap-1.5 rounded-full border border-hairline px-3 text-xs font-semibold text-ink-2 hover:text-ink-1"
        >
          {t("nav.profile")}
          <Icon name="arrowRight" size={13} strokeWidth={2.4} />
        </Link>
      }
      className={className}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-field bg-ghost p-3">
          <p className="caption">{t("profile.level.label")}</p>
          <p className="num-md mt-1 text-ink-1">{g.level.level}</p>
          <p className="truncate text-xs text-ink-3">{tk(`level.rank.${g.level.rank}`, "")}</p>
        </div>
        <div className="rounded-field bg-ghost p-3">
          <p className="caption">{t("profile.health.label")}</p>
          <p className={`num-md mt-1 ${tone}`}>{g.health.score}</p>
          <p className="truncate text-xs text-ink-3">{t(`health.grade.${g.health.grade}`)}</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressMeter value={g.level.progress} max={1} label={t("profile.level.progress")} />
        <p className="tnum mt-1.5 text-xs text-ink-3">
          {t("profile.level.toNext", {
            xp: formatNumber(g.level.next - g.level.xp, 0),
            level: g.level.level + 1,
          })}
          {" · "}
          {t("profile.ach.count", { n: unlocked, total: g.achievements.length })}
        </p>
      </div>
      {nextUp && (
        <p className="mt-3 flex items-center gap-2 border-t border-hairline pt-3 text-sm text-ink-2">
          <span aria-hidden className="text-lg">
            {nextUp.icon}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {t("dash.nextAchievement", { name: tk(`ach.${nextUp.id}.title`, nextUp.id) })}
          </span>
          <span className="tnum text-xs text-ink-3">{formatPercent(nextUp.progress * 100, 0)}</span>
        </p>
      )}
    </GlassCard>
  );
}

export function DashboardPage() {
  const { state, update } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const month = currentMonth();
  const today = todayISO();
  const currencies = displayCurrencies(state);

  const worth = netWorth(state, today);
  const worthAMonthAgo = netWorth(state, dateInMonth(addMonths(month, -1), Number(today.slice(8))));
  const worthDelta = worth.total - worthAMonthAgo.total;
  const worthDeltaPct = worthAMonthAgo.total > 0 ? (worthDelta / worthAMonthAgo.total) * 100 : 0;

  const series = monthlySeries(state.transactions, month, 12, settings);
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const netDelta = current.net - previous.net;

  const savingsRate = (m: { income: number; net: number }) => (m.income > 0 ? (m.net / m.income) * 100 : 0);
  const rateDelta = savingsRate(current) - savingsRate(previous);
  const planned = (type: "income" | "expense") =>
    state.transactions
      .filter((tx) => tx.type === type && monthOf(tx.date) === month && tx.date > today)
      .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);
  const plannedIncome = planned("income");
  const plannedExpense = planned("expense");
  const soFar = (total: number, ahead: number) =>
    ahead > 0
      ? t("tx.soFarPlanned", {
          soFar: formatMoney(total - ahead, base, { compact: true }),
          planned: formatMoney(ahead, base, { compact: true }),
        })
      : undefined;
  const vsLast = (delta: number) => t("tx.vsLastMonth", { delta: formatMoney(delta, base, { compact: true, sign: true }) });
  const hasPrevious = previous.income > 0 || previous.expense > 0;
  const earningMonths = series.filter((m) => m.income > 0);
  const avgKept = earningMonths.length ? earningMonths.reduce((s, m) => s + m.net, 0) / earningMonths.length : 0;

  const budgetSpent = (categoryId: string, currency: Currency) => {
    let sum = 0;
    for (const id of descendantsOf(state.categories, categoryId)) {
      sum += spentInCategory(state.transactions, id, month, currency, settings);
    }
    return sum;
  };

  const budgetHealth = state.budgets.reduce(
    (acc, b) => {
      acc.limit += convert(b.limit, b.currency, base, settings.rates);
      const spent = budgetSpent(b.categoryId, b.currency);
      acc.spent += convert(spent, b.currency, base, settings.rates);
      if (spent > b.limit) acc.over++;
      return acc;
    },
    { limit: 0, spent: 0, over: 0 },
  );
  const unbudgeted = current.expense - budgetHealth.spent;

  const [cashMonths, setCashMonths] = useState(12);
  const cashSeries = monthlySeries(state.transactions, month, cashMonths, settings);

  const byCategory = rollupToParents(expensesByCategory(state.transactions, month, settings), state.categories);
  const segments: BreakdownSegment[] = [...byCategory.entries()].map(([categoryId, value]) => {
    const cat = state.categories.find((c) => c.id === categoryId);
    return {
      id: categoryId,
      label: category(cat),
      icon: cat?.icon ?? "❓",
      value,
      colorSlot: cat?.colorSlot ?? 3,
    };
  });

  const budgetExtra = (categoryId: string): ReactNode => {
    const budget = state.budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return null;
    const spent = budgetSpent(categoryId, budget.currency);
    return (
      <div className="mt-1.5 pl-5">
        <ProgressMeter
          value={spent}
          max={budget.limit}
          tone="budget"
          label={t("tx.budgets.itemLabel", { name: category(state.categories.find((c) => c.id === categoryId)) })}
        />
        <p className="mt-1 text-xs text-ink-3">{t("dash.ofBudget", { limit: formatMoney(budget.limit, budget.currency) })}</p>
      </div>
    );
  };

  const allocation = currencyAllocation(state, today);
  const allocationSegments: BreakdownSegment[] = allocation.map((a) => ({
    id: a.currency,
    label: a.currency,
    icon: CURRENCY_SYMBOL[a.currency],
    value: a.base,
    colorSlot: CURRENCY_SLOT[a.currency],
  }));

  const kindLabel = (id: string) => {
    const [family, value] = id.split(":");
    return family === "acc" ? t(`accountKind.${value as AccountKind}`) : t(`investmentKind.${value as InvestmentKind}`);
  };

  const allHoldings = holdings(state, today);
  const holdingSlot = new Map(allHoldings.map((h, i) => [h.id, (i % 13) + 1]));
  const holdingRows = allHoldings.filter((h) => h.base > 0).sort((a, b) => b.base - a.base);
  const holdingSegments: BreakdownSegment[] = holdingRows.map((h) => ({
    id: h.id,
    label: h.label,
    icon: h.icon,
    value: h.base,
    colorSlot: holdingSlot.get(h.id) ?? 1,
  }));
  const kindRows = netWorthByKind(state, today).map((r) => ({ ...r, label: kindLabel(r.id) }));
  const accKindRows = kindRows.filter((r) => r.id.startsWith("acc:"));
  const invKindRows = kindRows.filter((r) => r.id.startsWith("inv:"));
  const kindSegments: BreakdownSegment[] = kindRows.map((r) => ({
    id: r.id,
    label: r.label,
    icon: r.icon,
    value: r.base,
    colorSlot: r.colorSlot,
  }));
  const [worthView, setWorthView] = useState<"holding" | "type">("holding");

  const holdingNative = (id: string): ReactNode => {
    const row = holdingRows.find((h) => h.id === id);
    if (!row || row.currency === base) return null;
    return <p className="tnum mt-0.5 pl-5 text-xs text-ink-3">{formatMoney(row.native, row.currency, { exact: true })}</p>;
  };

  const monthSubs = state.subscriptions.filter((s) => subscriptionBillsIn(s, month));
  const subsTotal = subscriptionsMonthlyTotal(monthSubs, base, settings);
  const subsSlot = state.categories.find((c) => c.id === "cat-subs")?.colorSlot ?? SUBSCRIPTION_SLOT;

  const topSubs = [...monthSubs]
    .sort(
      (a, b) =>
        convert(b.period === "yearly" ? b.price / 12 : b.price, b.currency, base, settings.rates) -
        convert(a.period === "yearly" ? a.price / 12 : a.price, a.currency, base, settings.rates),
    )
    .slice(0, 5);
  const nextCharge = (sub: { dayOfMonth: number; endMonth?: string }) => {
    const thisMonth = dateInMonth(month, sub.dayOfMonth);
    if (thisMonth >= today) return thisMonth;
    const nextMonth = addMonths(month, 1);
    if (sub.endMonth && sub.endMonth < nextMonth) return null;
    return dateInMonth(nextMonth, sub.dayOfMonth);
  };
  const monthsWithExpense = series.filter((m) => m.expense > 0);
  const avgExpense = monthsWithExpense.length
    ? monthsWithExpense.reduce((s, m) => s + m.expense, 0) / monthsWithExpense.length
    : 0;
  const subsShare = avgExpense > 0 ? (subsTotal / avgExpense) * 100 : 0;

  const hasAnyData =
    state.transactions.length > 0 || state.savings.length > 0 || state.investments.length > 0 || state.debts.length > 0;

  const otherCurrencies = currencies.filter((c) => c !== base);

  return (
    <>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle={formatMonth(month)}
        action={
          <SegmentedControl
            label={t("settings.baseCurrency")}
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={base}
            onChange={(v: Currency) => update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))}
            className={currencies.length > 3 ? "w-56" : "w-44"}
          />
        }
      />

      {!hasAnyData ? (
        <GlassCard className="glow">
          <EmptyState
            icon={<Icon name="sparkle" />}
            title={t("dash.empty")}
            hint={t("dash.empty.hint")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href="/balance">{t("dash.empty.accounts")}</LinkButton>
                <LinkButton href="/income">{t("dash.empty.income")}</LinkButton>
              </div>
            }
          />
        </GlassCard>
      ) : (
        <div className="stagger grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-6 xl:grid-cols-12">
          <GlassCard
            title={t("balance.netWorth")}
            icon="wallet"
            className="glow col-span-2 lg:col-span-6 xl:col-span-4 xl:row-span-2"
          >
            <div>
              <p className="hero-number num-hero">{formatMoney(worth.total, base)}</p>
              <p className="tnum mt-2 text-[15px] text-ink-2">
                {otherCurrencies
                  .map((c) => formatMoney(convert(worth.total, base, c, settings.rates), c, { exact: true }))
                  .join("  ·  ")}
              </p>
              {worthAMonthAgo.total !== 0 && worthDelta !== 0 && (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className={`tnum font-semibold ${worthDelta >= 0 ? "text-income" : "text-expense"}`}>
                    {formatMoney(worthDelta, base, { compact: true, sign: true })}
                  </span>
                  <span className="text-ink-3">
                    {t("dash.inAMonth", {
                      pct: `${worthDelta >= 0 ? "+" : "−"}${formatPercent(Math.abs(worthDeltaPct))}`,
                    })}
                  </span>
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-1 flex-col border-t border-hairline pb-1 pt-4">
              <div className="flex flex-1 flex-col justify-evenly gap-5">
                <WorthGroup label={t("balance.accounts")} total={worth.savings} rows={accKindRows} base={base} />
                <WorthGroup label={t("balance.investments")} total={worth.investments} rows={invKindRows} base={base} />
                {worth.debts > 0 && (
                  <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3 text-sm">
                    <span className="text-ink-2">{t("balance.debts")}</span>
                    <span className="tnum font-semibold text-expense">
                      −{formatMoney(worth.debts, base, { compact: true })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label={t("tx.stat.income")}
            href="/income"
            value={formatMoney(current.income, base, { compact: true })}
            tone="income"
            spark={series.map((m) => m.income)}
            delta={
              hasPrevious
                ? { text: vsLast(current.income - previous.income), good: current.income >= previous.income }
                : undefined
            }
            hint={soFar(current.income, plannedIncome)}
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label={t("tx.stat.expenses")}
            href="/transactions"
            value={formatMoney(current.expense, base, { compact: true })}
            tone="expense"
            spark={series.map((m) => m.expense)}
            delta={
              hasPrevious
                ? { text: vsLast(current.expense - previous.expense), good: current.expense <= previous.expense }
                : undefined
            }
            hint={soFar(current.expense, plannedExpense)}
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label={t("dash.netFlow")}
            value={formatMoney(current.net, base, { compact: true, sign: true })}
            spark={series.map((m) => m.net)}
            delta={hasPrevious ? { text: vsLast(netDelta), good: current.net >= previous.net } : undefined}
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label={t("dash.savingsRate")}
            value={current.income > 0 ? formatPercent(savingsRate(current)) : "—"}
            spark={series.map(savingsRate)}
            delta={
              current.income > 0 && previous.income > 0 && hasPrevious
                ? {
                    text: t("dash.ppVsLast", {
                      delta: `${rateDelta >= 0 ? "+" : "−"}${formatNumber(Math.abs(rateDelta), 1)}`,
                    }),
                    good: rateDelta >= 0,
                  }
                : undefined
            }
            hint={t("dash.keptAvg", { amount: formatMoney(avgKept, base, { compact: true }) })}
          />

          <GlassCard
            title={t("tx.flow")}
            icon="chart"
            action={<PeriodTabs value={cashMonths} onChange={setCashMonths} />}
            className="col-span-2 lg:col-span-6 xl:col-span-8"
          >
            {state.transactions.length > 0 ? (
              <MonthlyColumns
                data={cashSeries.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
                currency={base}
                height={210}
              />
            ) : (
              <EmptyState
                icon={<Icon name="chart" />}
                title={t("dash.chart.empty")}
                hint={t("dash.chart.empty.hint")}
                action={<LinkButton href="/transactions">{t("dash.addTransaction")}</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard
            title={t("dash.spending")}
            icon="spend"
            action={<CardLink href="/transactions" />}
            className="col-span-2 lg:col-span-6 xl:col-span-4"
          >
            {segments.length > 0 ? (
              <>
                <div className="mb-3.5 flex items-end justify-between gap-3">
                  <p className="num-md whitespace-nowrap text-ink-1">{formatMoney(current.expense, base, { compact: true })}</p>
                  <p className="text-xs text-ink-3">
                    {tp("common.categories", segments.length)} ·{" "}
                    <span className={current.expense <= previous.expense ? "text-income" : "text-expense"}>
                      {vsLast(current.expense - previous.expense)}
                    </span>
                  </p>
                </div>
                <CategoryBreakdown segments={segments} currency={base} rowExtra={budgetExtra} />
              </>
            ) : (
              <EmptyState
                icon={<Icon name="receipt" />}
                title={t("tx.where.empty")}
                hint={t("dash.spending.empty.hint")}
                action={<LinkButton href="/transactions">{t("dash.addExpense")}</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard
            title={worthView === "type" ? t("dash.worthByType") : t("dash.worthByHolding")}
            icon="bank"
            action={
              kindSegments.length > 1 ? (
                <SegmentedControl
                  size="sm"
                  label={t("dash.worthView")}
                  options={[
                    { value: "holding" as const, label: t("dash.worthView.holding") },
                    { value: "type" as const, label: t("dash.worthView.type") },
                  ]}
                  value={worthView}
                  onChange={setWorthView}
                />
              ) : (
                <CardLink href="/balance" />
              )
            }
            className="col-span-2 lg:col-span-3 xl:col-span-4"
          >
            {holdingSegments.length > 0 ? (
              <>
                {worthView === "type" ? (
                  <CategoryBreakdown segments={kindSegments} currency={base} maxSegments={7} />
                ) : (
                  <CategoryBreakdown segments={holdingSegments} currency={base} maxSegments={7} rowExtra={holdingNative} />
                )}
                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-hairline pt-3.5">
                  <div>
                    <p className="card-title">{t("balance.accounts")}</p>
                    <p className="num-sm mt-1 text-ink-1">{formatMoney(worth.savings, base, { compact: true })}</p>
                    <p className="mt-1 text-xs text-ink-3">{tp("dash.accountsCount", state.savings.length)}</p>
                  </div>
                  <div>
                    <p className="card-title">{t("balance.investments")}</p>
                    <p className="num-sm mt-1 text-ink-1">{formatMoney(worth.investments, base, { compact: true })}</p>
                    <p className="mt-1 text-xs text-ink-3">{tp("balance.inv.positions", state.investments.length)}</p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Icon name="bank" />}
                title={t("dash.holdings.empty")}
                hint={t("dash.holdings.empty.hint")}
                action={<LinkButton href="/balance">{t("dash.holdings.add")}</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard title={t("dash.currency")} icon="globe" className="col-span-2 lg:col-span-3 xl:col-span-4">
            {allocationSegments.some((s) => s.value > 0) ? (
              <>
                <Donut
                  segments={allocationSegments.filter((s) => s.value > 0)}
                  currency={base}
                  centerLabel={t("dash.currency.center")}
                  legend={false}
                />
                <ul className="mt-auto space-y-2 border-t border-hairline pt-3.5">
                  {allocation
                    .filter((a) => a.native !== 0)
                    .map((a) => (
                      <li key={a.currency} className="flex items-baseline justify-between gap-3">
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
                  <li className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2 text-xs text-ink-3">
                    <span>
                      {currencies
                        .filter((c) => c !== "UAH")
                        .map((c) => `1 ${CURRENCY_SYMBOL[c]} = ${formatNumber(settings.rates[c as "USD" | "EUR"], 2)} ₴`)
                        .join(" · ")}
                    </span>
                  </li>
                </ul>
              </>
            ) : (
              <EmptyState icon={<Icon name="exchange" />} title={t("dash.currency.empty")} hint={t("dash.currency.empty.hint")} />
            )}
          </GlassCard>

          <GlassCard
            title={t("tx.subs")}
            icon="device"
            action={<CardLink href="/transactions" />}
            className="col-span-2 self-start lg:col-span-3 xl:col-span-4"
          >
            {monthSubs.length > 0 ? (
              <>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num-md whitespace-nowrap text-ink-1">
                      {formatMoney(subsTotal, base, { compact: true })}
                      <span className="text-sm font-medium text-ink-3">{t("common.perMonth")}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {t("dash.subs.summary", {
                        n: monthSubs.length,
                        year: formatMoney(subsTotal * 12, base, { compact: true }),
                      })}
                    </p>
                  </div>
                  {subsShare > 0 && (
                    <span className="shrink-0 rounded-full bg-ghost px-2.5 py-1 text-xs font-semibold text-ink-2">
                      {t("dash.subs.share", { pct: formatPercent(subsShare, 0) })}
                    </span>
                  )}
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                      <th className="py-1.5 pr-3 font-semibold">{t("dash.subs.service")}</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">{t("dash.subs.next")}</th>
                      <th className="py-1.5 text-right font-semibold">{t("dash.subs.perMonth")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSubs.map((sub) => {
                      const next = nextCharge(sub);
                      return (
                        <tr key={sub.id} className="border-b border-hairline last:border-b-0">
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-2.5">
                              <IconDisc colorSlot={subsSlot} className="size-8 rounded-full text-sm">
                                {sub.icon}
                              </IconDisc>
                              <span className="min-w-0">
                                <span className="block truncate text-ink-1">{sub.name}</span>
                                {sub.period === "yearly" && (
                                  <span className="block text-xs text-ink-3">{t("dash.subs.yearly")}</span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="tnum whitespace-nowrap py-2 pr-3 text-right text-xs text-ink-2">
                            {next ? formatDateShort(next) : t("dash.subs.lastCharge")}
                          </td>
                          <td className="py-2 text-right">
                            <Money
                              amount={sub.period === "yearly" ? sub.price / 12 : sub.price}
                              currency={sub.currency}
                              exact
                              className="font-medium text-ink-1"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {monthSubs.length > topSubs.length && (
                  <p className="mt-2 text-xs text-ink-3">{t("dash.subs.more", { n: monthSubs.length - topSubs.length })}</p>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Icon name="device" />}
                title={t("dash.subs.empty")}
                hint={t("dash.subs.empty.hint")}
                action={<LinkButton href="/transactions">{t("dash.subs.add")}</LinkButton>}
              />
            )}
          </GlassCard>

          <ProgressCard className="col-span-2 self-start lg:col-span-3 xl:col-span-4" />

          {state.budgets.length > 0 && (
            <GlassCard
              title={t("tx.budgets")}
              subtitle={t("dash.budgets.of", {
                spent: formatMoney(budgetHealth.spent, base, { compact: true }),
                limit: formatMoney(budgetHealth.limit, base, { compact: true }),
              })}
              icon="target"
              action={<CardLink href="/transactions" />}
              className="col-span-2 self-start lg:col-span-3 xl:col-span-4"
            >
              <ProgressMeter value={budgetHealth.spent} max={budgetHealth.limit} tone="budget" label={t("tx.budgets.all")} />
              <p className={`num-sm mt-3 ${budgetHealth.spent > budgetHealth.limit ? "text-expense" : "text-ink-1"}`}>
                {budgetHealth.limit > budgetHealth.spent
                  ? t("tx.budgets.left", { amount: formatMoney(budgetHealth.limit - budgetHealth.spent, base, { compact: true }) })
                  : t("tx.budgets.over", { amount: formatMoney(budgetHealth.spent - budgetHealth.limit, base, { compact: true }) })}
              </p>
              <ul className="caption mt-2 space-y-1">
                <li>
                  {tp("dash.budgets.count", state.budgets.length)}
                  {budgetHealth.over > 0 && (
                    <span className="text-expense"> · {tp("dash.budgets.overCount", budgetHealth.over)}</span>
                  )}
                </li>
                {unbudgeted > 0.5 && (
                  <li>{t("tx.budgets.outside", { amount: formatMoney(unbudgeted, base, { compact: true }) })}</li>
                )}
              </ul>
            </GlassCard>
          )}

          <QuickAdd className="col-span-2 self-start lg:col-span-3 xl:col-span-4" />
        </div>
      )}
    </>
  );
}

function QuickAdd({ className = "" }: { className?: string }) {
  const { state, update } = useStore();
  const { t } = useT();
  const base = state.settings.baseCurrency;
  const currencies = displayCurrencies(state);

  const expenseCategoryGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeCategoryGroups = useCategoryGroups(state.categories, ["income"]);
  const accountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const currency = currencyChoice ?? base;
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savedTick, setSavedTick] = useState(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tickTimer.current) clearTimeout(tickTimer.current);
    },
    [],
  );

  const categories = state.categories.filter((c) => c.kind === type);
  const categoryId =
    categoryChoice && categories.some((c) => c.id === categoryChoice)
      ? categoryChoice
      : (categoryTree(state.categories, type)[0]?.parent.id ?? "");
  const accountId =
    accountChoice !== null && (accountChoice === "" || state.savings.some((a) => a.id === accountChoice))
      ? accountChoice
      : (state.savings[0]?.id ?? "");
  const parsed = parseAmount(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && categoryId !== "";

  const switchType = (next: "income" | "expense") => {
    setType(next);
    setCategoryChoice(null);
  };

  const submit = () => {
    if (!valid) return;
    const txType: TxType = type;
    update((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        {
          id: uid(),
          type: txType,
          amount: parsed,
          currency,
          categoryId,
          date: todayISO(),
          note: note.trim() || undefined,
          accountId: accountId || undefined,
        },
      ],
    }));
    setAmount("");
    setNote("");
    setSavedTick(true);
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setSavedTick(false), 1600);
  };

  return (
    <GlassCard title={t("dash.quick")} icon="bolt" className={className}>
      <div className="space-y-3">
        <FieldSet label={t("tx.kind")}>
          <SegmentedControl
            label={t("tx.kind")}
            options={[
              { value: "expense" as const, label: t("tx.type.expense") },
              { value: "income" as const, label: t("tx.type.income") },
            ]}
            value={type}
            onChange={switchType}
          />
        </FieldSet>
        <Field label={t("common.amount")}>
          <TextInput
            inputMode="decimal"
            placeholder="0"
            prefix={CURRENCY_SYMBOL[currency]}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <FieldSet label={t("common.currency")}>
          <SegmentedControl
            label={t("common.currency")}
            options={currencies.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrencyChoice}
          />
        </FieldSet>
        <Field label={t("common.category")}>
          <OptionPicker
            label={t("common.category")}
            value={categoryId}
            onChange={setCategoryChoice}
            groups={type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
          />
        </Field>
        {state.savings.length > 0 && (
          <Field label={t("common.account")}>
            <OptionPicker
              label={t("common.account")}
              value={accountId}
              onChange={setAccountChoice}
              groups={accountGroups}
            />
          </Field>
        )}
        <Field label={t("common.note")}>
          <TextInput placeholder={t("common.optional")} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button className="w-full" onClick={submit} disabled={!valid}>
          {savedTick ? t("dash.quick.added") : t("dash.quick.add")}
        </Button>
      </div>
    </GlassCard>
  );
}
