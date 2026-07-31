"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  CategoryBreakdown,
  Donut,
  MonthlyColumns,
  PeriodTabs,
  Sparkline,
  StackedArea,
  StatTile,
  type AreaPoint,
  type BreakdownSegment,
} from "@/components/charts";
import {
  Button,
  EmptyState,
  GlassCard,
  Money,
  ProgressMeter,
  SegmentedControl,
  Select,
  TextInput,
} from "@/components/ui";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  dateInMonth,
  formatDateShort,
  formatMonth,
  todayISO,
} from "@/lib/date";
import {
  averageMonthlyNet,
  buildProjection,
  currencyAllocation,
  expensesByCategory,
  holdings,
  monthlySeries,
  netWorth,
  spentInCategory,
  subscriptionsMonthlyTotal,
} from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import type { Currency, TxType } from "@/lib/types";

// a donut has every slice touching both neighbours, so these three were
// validated on all pairs — slot 3 (plum) is deliberately skipped, it sits too
// close to slot 1 (raspberry): slots 1+2+5 were validated on all pairs
const CURRENCY_SLOT: Record<Currency, number> = { UAH: 1, USD: 2, EUR: 5 };

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-md transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}

function CardLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-hairline bg-ghost px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-ghost-2"
    >
      All
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h13M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

export function DashboardPage() {
  const { state, update } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const month = currentMonth();
  const today = todayISO();

  const worth = netWorth(state, today);

  // 12 months feeds the stat-tile sparklines; the cash-flow chart has its own
  // selectable window
  const series = monthlySeries(state.transactions, month, 12, settings);
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const netDelta = current.net - previous.net;

  // share of income kept, in percent — the tile shows this month's, the
  // sparkline the last twelve, the delta the swing in percentage points
  const savingsRate = (m: { income: number; net: number }) =>
    m.income > 0 ? (m.net / m.income) * 100 : 0;
  const rateDelta = savingsRate(current) - savingsRate(previous);
  const earningMonths = series.filter((m) => m.income > 0);
  const avgKept = earningMonths.length
    ? earningMonths.reduce((s, m) => s + m.net, 0) / earningMonths.length
    : 0;

  // liquid runway: how many months your cash covers typical spending
  const monthsWithExpense = series.filter((m) => m.expense > 0);
  const avgExpense = monthsWithExpense.length
    ? monthsWithExpense.reduce((s, m) => s + m.expense, 0) / monthsWithExpense.length
    : 0;
  const runwayMonths = avgExpense > 0 ? worth.savings / avgExpense : 0;
  const runwayLabel =
    avgExpense <= 0 || worth.savings <= 0
      ? "—"
      : runwayMonths >= 24
        ? "24+ mo"
        : `${runwayMonths < 10 ? runwayMonths.toFixed(1) : Math.round(runwayMonths)} mo`;

  const [cashMonths, setCashMonths] = useState(12);
  const cashSeries = monthlySeries(state.transactions, month, cashMonths, settings);

  const byCategory = expensesByCategory(state.transactions, month, settings);
  const segments: BreakdownSegment[] = [...byCategory.entries()].map(
    ([categoryId, value]) => {
      const cat = state.categories.find((c) => c.id === categoryId);
      return {
        id: categoryId,
        label: cat?.name ?? "Uncategorized",
        icon: cat?.icon ?? "❓",
        value,
        colorSlot: cat?.colorSlot ?? 3,
      };
    },
  );

  const budgetExtra = (categoryId: string): ReactNode => {
    const budget = state.budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return null;
    const spent = spentInCategory(
      state.transactions,
      categoryId,
      month,
      budget.currency,
      settings,
    );
    return (
      <div className="mt-1.5 pl-5">
        <ProgressMeter value={spent} max={budget.limit} tone="budget" />
        <p className="mt-1 text-xs text-ink-3">
          of {formatMoney(budget.limit, budget.currency)}
        </p>
      </div>
    );
  };

  /* currency allocation of net worth */
  const allocation = currencyAllocation(state, today);
  const allocationSegments: BreakdownSegment[] = allocation.map((a) => ({
    id: a.currency,
    label: a.currency,
    icon: CURRENCY_SYMBOL[a.currency],
    value: a.base,
    colorSlot: CURRENCY_SLOT[a.currency],
  }));

  /* holdings composition (the balance-sheet table, as a chart) */
  const holdingRows = holdings(state, today)
    .filter((h) => h.base > 0)
    .sort((a, b) => b.base - a.base);
  const holdingSegments: BreakdownSegment[] = holdingRows.map((h, i) => ({
    id: h.id,
    label: h.label,
    icon: h.icon,
    value: h.base,
    colorSlot: (i % 8) + 1,
  }));

  /* subscriptions */
  const activeSubs = state.subscriptions.filter((s) => s.active);
  const subsTotal = subscriptionsMonthlyTotal(state.subscriptions, base, settings);
  const topSubs = [...activeSubs]
    .sort(
      (a, b) =>
        convert(b.price, b.currency, base, settings.rates) -
        convert(a.price, a.currency, base, settings.rates),
    )
    .slice(0, 5);
  /** the day this subscription bills next — this month if it is still ahead */
  const nextCharge = (sub: { dayOfMonth: number }) => {
    const thisMonth = dateInMonth(month, sub.dayOfMonth);
    return thisMonth >= today ? thisMonth : dateInMonth(addMonths(month, 1), sub.dayOfMonth);
  };
  // what share of a typical month's spending is already committed to subs
  const subsShare = avgExpense > 0 ? (subsTotal / avgExpense) * 100 : 0;

  /* forecast preview: 5 years, contribution = avg net of last 3 months */
  const monthlySavings = Math.max(
    0,
    Math.round(averageMonthlyNet(state.transactions, month, 3, settings)),
  );
  const projection = buildProjection(state, today, 60, { monthlySavings });
  const projectionPoints: AreaPoint[] = projection.map((p) => ({
    label: p.month,
    a: p.savings,
    b: p.investments,
  }));
  const inFiveYears = projection[projection.length - 1];

  // exclude planned (future-dated) postings so they don't masquerade as recent
  const recent = state.transactions
    .filter((t) => t.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 7);

  const hasAnyData =
    state.transactions.length > 0 ||
    state.savings.length > 0 ||
    state.investments.length > 0;

  const otherCurrencies = CURRENCIES.filter((c) => c !== base);

  return (
    <>
      {/* header row */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-tight text-ink-1 sm:text-[1.8rem]">
            Dashboard
          </h1>
          <p className="text-sm text-ink-2">{formatMonth(month)}</p>
        </div>
        <SegmentedControl
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={base}
          onChange={(v: Currency) =>
            update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))
          }
          className="w-44"
        />
      </header>

      {!hasAnyData ? (
        <GlassCard className="glow">
          <EmptyState
            icon="✨"
            title="Let’s set things up"
            hint="Add your accounts on Balance, log income on Income, and record expenses — the dashboard fills itself in."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href="/balance">Add accounts</LinkButton>
                <LinkButton href="/income">Log income</LinkButton>
              </div>
            }
          />
        </GlassCard>
      ) : (
        // two columns on phones so the month tiles pair up instead of each
        // taking a full screen-width row; twelve on desktop for the mixed spans
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-12">
          {/* hero: net worth, spans two rows next to tiles + cash flow */}
          <GlassCard className="glow col-span-2 xl:col-span-4 xl:row-span-2">
            <div>
              <p className="card-title">Net worth</p>
              <p className="hero-number mt-3 text-[2.9rem] font-bold leading-none tracking-tight">
                {formatMoney(worth.total, base)}
              </p>
              <p className="tnum mt-2 text-[15px] text-ink-2">
                {otherCurrencies
                  .map((c) =>
                    formatMoney(convert(worth.total, base, c, settings.rates), c, {
                      exact: true,
                    }),
                  )
                  .join("  ·  ")}
              </p>
            </div>
            <div className="mt-6 space-y-2.5 border-t border-hairline pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Accounts</span>
                <Money amount={worth.savings} currency={base} className="font-semibold text-ink-1" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Investments</span>
                <Money amount={worth.investments} currency={base} className="font-semibold text-ink-1" />
              </div>
              {worth.debts > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-2">Debts</span>
                  <span className="tnum font-semibold text-expense">
                    −{formatMoney(worth.debts, base, { compact: true })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Subscriptions</span>
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(subsTotal, base, { compact: true })}/mo
                </span>
              </div>
              {worth.assets > 0 && (
                <div className="pt-1">
                  {/* same two colours the 5-year outlook uses for these
                      series, so the split reads across both cards */}
                  <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="bar-slice bg-series-2"
                      style={{ width: `${(worth.savings / worth.assets) * 100}%` }}
                    />
                    <div
                      className="bar-slice bg-series-1"
                      style={{ width: `${(worth.investments / worth.assets) * 100}%`, "--i": 1 } as CSSProperties}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">
                    {formatPercent((worth.savings / worth.assets) * 100, 0)} accounts ·{" "}
                    {formatPercent((worth.investments / worth.assets) * 100, 0)} investments
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 border-t border-hairline pt-4">
              <div className="min-w-0">
                <p className="card-title">Runway</p>
                <p className="mt-1 text-xl font-bold text-ink-1">{runwayLabel}</p>
                <p className="text-xs text-ink-3">savings cover spending</p>
              </div>
              {series.some((m) => m.net !== 0) && (
                <div className="text-right">
                  <p className="card-title mb-1.5">Net flow · 12 mo</p>
                  <Sparkline values={series.map((m) => m.net)} width={150} height={46} />
                </div>
              )}
            </div>
          </GlassCard>

          {/* month tiles — one skeleton, each with its own trend and a line of
              context, so the row reads as a single instrument panel */}
          <StatTile
            className="xl:col-span-2"
            label="Income"
            value={formatMoney(current.income, base, { compact: true })}
            tone="income"
            spark={series.map((m) => m.income)}
            delta={{
              text: `${formatMoney(current.income - previous.income, base, { compact: true, sign: true })} vs last month`,
              good: current.income >= previous.income,
            }}
          />
          <StatTile
            className="xl:col-span-2"
            label="Expenses"
            value={formatMoney(current.expense, base, { compact: true })}
            tone="expense"
            spark={series.map((m) => m.expense)}
            delta={{
              text: `${formatMoney(current.expense - previous.expense, base, { compact: true, sign: true })} vs last month`,
              // spending less than last month is the good direction
              good: current.expense <= previous.expense,
            }}
          />
          <StatTile
            className="xl:col-span-2"
            label="Net flow"
            value={formatMoney(current.net, base, { compact: true, sign: true })}
            spark={series.map((m) => m.net)}
            delta={{
              text: `${formatMoney(netDelta, base, { compact: true, sign: true })} vs last month`,
              good: current.net >= previous.net,
            }}
          />
          <StatTile
            className="xl:col-span-2"
            label="Savings rate"
            value={current.income > 0 ? formatPercent(savingsRate(current)) : "—"}
            spark={series.map(savingsRate)}
            delta={
              current.income > 0 && previous.income > 0
                ? {
                    text: `${rateDelta >= 0 ? "+" : "−"}${Math.abs(rateDelta).toFixed(1)} pp vs last month`,
                    good: rateDelta >= 0,
                  }
                : undefined
            }
            hint={`${formatMoney(avgKept, base, { compact: true })}/mo kept on average`}
          />

          {/* cash flow — beside the hero on xl */}
          <GlassCard
            title="Cash flow"
            icon="📊"
            action={<PeriodTabs value={cashMonths} onChange={setCashMonths} />}
            className="col-span-2 xl:col-span-8"
          >
            {state.transactions.length > 0 ? (
              <MonthlyColumns
                data={cashSeries.map((m) => ({
                  month: m.month,
                  income: m.income,
                  expense: m.expense,
                }))}
                currency={base}
                height={210}
              />
            ) : (
              <EmptyState
                icon="📊"
                title="No data for the chart yet"
                hint="Record income and expenses to see the monthly dynamic."
                action={<LinkButton href="/transactions">Add a transaction</LinkButton>}
              />
            )}
          </GlassCard>

          {/* breakdowns row */}
          <GlassCard
            title="Spending by category"
            icon="💸"
            action={<CardLink href="/transactions" />}
            className="col-span-2 self-start xl:col-span-4"
          >
            {segments.length > 0 ? (
              <>
                {/* headline first: what the breakdown below adds up to, and
                    whether that is more or less than the month before */}
                <div className="mb-3.5 flex items-end justify-between gap-3">
                  <p className="tnum whitespace-nowrap text-2xl font-bold leading-none text-ink-1">
                    {formatMoney(current.expense, base, { compact: true })}
                  </p>
                  <p className="text-xs text-ink-3">
                    {segments.length} categor{segments.length === 1 ? "y" : "ies"} ·{" "}
                    <span
                      className={
                        current.expense <= previous.expense ? "text-income" : "text-expense"
                      }
                    >
                      {formatMoney(current.expense - previous.expense, base, {
                        compact: true,
                        sign: true,
                      })}
                    </span>{" "}
                    vs last month
                  </p>
                </div>
                <CategoryBreakdown segments={segments} currency={base} rowExtra={budgetExtra} />
              </>
            ) : (
              <EmptyState
                icon="🧾"
                title="No spending this month"
                hint="Add your first expense to see the breakdown."
                action={<LinkButton href="/transactions">Add an expense</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard
            title="Net worth by holding"
            icon="🏦"
            action={<CardLink href="/balance" />}
            className="col-span-2 self-start xl:col-span-4"
          >
            {holdingSegments.length > 0 ? (
              <CategoryBreakdown segments={holdingSegments} currency={base} maxSegments={7} />
            ) : (
              <EmptyState
                icon="🏦"
                title="No holdings yet"
                hint="Add accounts and investments on Balance."
                action={<LinkButton href="/balance">Add on Balance</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard title="Currency allocation" icon="🌐" className="col-span-2 self-start xl:col-span-4">
            {allocationSegments.some((s) => s.value > 0) ? (
              <>
                <Donut
                  segments={allocationSegments.filter((s) => s.value > 0)}
                  currency={base}
                  centerLabel="Held in"
                  legendValues={false}
                />
                <p className="mt-4 text-xs text-ink-3">
                  Native amounts:{" "}
                  {allocation
                    .map((a) => formatMoney(a.native, a.currency, { compact: true }))
                    .join(" · ")}
                </p>
              </>
            ) : (
              <EmptyState
                icon="💱"
                title="Nothing to allocate yet"
                hint="Once you hold money in ₴, $ or €, the split shows up here."
              />
            )}
          </GlassCard>

          {/* outlook, with the two narrow cards stacked beside it: one tall
              chart next to one column of short cards leaves no hole */}
          {(state.savings.length > 0 || state.investments.length > 0) && (
            <GlassCard
              title="5-year outlook"
              icon="🔮"
              action={<CardLink href="/forecast" />}
              className="col-span-2 xl:col-span-8"
            >
              <StackedArea
                points={projectionPoints}
                currency={base}
                height={360}
                xTickEvery={12}
                xTickFormat={(label) => label.slice(0, 4)}
              />
              {/* where the curve starts, where it lands, and the gap between
                  them — the three numbers the chart is actually about */}
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-3.5">
                {[
                  { label: "Now", value: formatMoney(worth.total, base, { compact: true }) },
                  {
                    label: "In 5 years",
                    value: formatMoney(inFiveYears.total, base, { compact: true }),
                  },
                  {
                    label: "Growth",
                    value: formatMoney(inFiveYears.total - worth.total, base, {
                      compact: true,
                      sign: true,
                    }),
                    good: true,
                  },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="card-title">{f.label}</p>
                    <p
                      className={`tnum mt-1 text-lg font-bold leading-none ${
                        f.good ? "text-income" : "text-ink-1"
                      }`}
                    >
                      {f.value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-3">
                Assuming you keep saving{" "}
                {formatMoney(monthlySavings, base, { compact: true })}/mo — your average
                over the last three months.
              </p>
            </GlassCard>
          )}

          <div className="col-span-2 flex flex-col gap-3 sm:gap-4 xl:col-span-4">
          <GlassCard
            title="Subscriptions"
            icon="📱"
            action={<CardLink href="/transactions" />}
          >
            {activeSubs.length > 0 ? (
              <>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum whitespace-nowrap text-2xl font-bold leading-none text-ink-1">
                      {formatMoney(subsTotal, base, { compact: true })}
                      <span className="text-sm font-medium text-ink-3">/mo</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {activeSubs.length} active ·{" "}
                      {formatMoney(subsTotal * 12, base, { compact: true })} a year
                    </p>
                  </div>
                  {subsShare > 0 && (
                    <span className="shrink-0 rounded-full bg-ghost px-2.5 py-1 text-xs font-semibold text-ink-2">
                      {formatPercent(subsShare, 0)} of spending
                    </span>
                  )}
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                      <th className="py-1.5 pr-3 font-semibold">Service</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">Next</th>
                      <th className="py-1.5 text-right font-semibold">Per month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSubs.map((sub) => (
                      <tr key={sub.id} className="border-b border-hairline last:border-b-0">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2.5">
                            <span
                              aria-hidden
                              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ghost text-sm"
                            >
                              {sub.icon}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-ink-1">{sub.name}</span>
                              {sub.period === "yearly" && (
                                <span className="block text-xs text-ink-3">billed yearly</span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="tnum whitespace-nowrap py-2 pr-3 text-right text-xs text-ink-2">
                          {formatDateShort(nextCharge(sub))}
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
                    ))}
                  </tbody>
                </table>
                {activeSubs.length > topSubs.length && (
                  <p className="mt-2 text-xs text-ink-3">
                    +{activeSubs.length - topSubs.length} more on the Expenses page
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                icon="📱"
                title="No subscriptions tracked"
                hint="Add them once and they post themselves monthly."
                action={<LinkButton href="/transactions">Add subscriptions</LinkButton>}
              />
            )}
          </GlassCard>
            <QuickAdd />
          </div>

          {/* the ledger preview runs the full width — seven rows read better
              wide than squeezed next to a form */}
          <GlassCard
            title="Recent transactions"
            icon="🧾"
            action={<CardLink href="/transactions" />}
            className="col-span-2 xl:col-span-12"
          >
            {recent.length > 0 ? (
              // a real table: aligned columns with a header, so amounts and
              // dates line up down the card instead of drifting per row
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-120 border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                      <th className="py-2 pr-3 font-semibold">Category</th>
                      <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Account</th>
                      <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">
                        Share of month
                      </th>
                      <th className="py-2 pr-3 text-right font-semibold">Date</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((tx) => {
                      const cat = state.categories.find((c) => c.id === tx.categoryId);
                      const account = state.savings.find((a) => a.id === tx.accountId);
                      const share =
                        tx.type === "expense" && current.expense > 0
                          ? (convert(tx.amount, tx.currency, base, settings.rates) /
                              current.expense) *
                            100
                          : 0;
                      return (
                        <tr
                          key={tx.id}
                          className="table-row border-b border-hairline last:border-b-0"
                        >
                          <td className="py-2.5 pr-3">
                            <span className="flex items-center gap-2.5">
                              <span
                                aria-hidden
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ghost text-sm"
                              >
                                {cat?.icon ?? "❓"}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-ink-1">
                                  {cat?.name ?? "Uncategorized"}
                                </span>
                                {tx.note && (
                                  <span className="block truncate text-xs text-ink-3">
                                    {tx.note}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="hidden py-2.5 pr-3 text-ink-2 sm:table-cell">
                            <span className="block truncate">{account?.name ?? "—"}</span>
                          </td>
                          <td className="hidden py-2.5 pr-3 sm:table-cell">
                            {share >= 1 ? (
                              <span className="flex items-center justify-end gap-2">
                                <span
                                  aria-hidden
                                  className="h-1.5 rounded-full bg-ghost-2"
                                  style={{ width: `${Math.min(100, share)}%`, minWidth: "0.25rem" }}
                                />
                                <span className="tnum w-8 shrink-0 text-right text-xs text-ink-2">
                                  {share.toFixed(0)}%
                                </span>
                              </span>
                            ) : (
                              <span className="block text-right text-xs text-ink-3">—</span>
                            )}
                          </td>
                          <td className="tnum whitespace-nowrap py-2.5 pr-3 text-right text-xs text-ink-2">
                            {formatDateShort(tx.date)}
                          </td>
                          <td className="py-2.5 text-right">
                            {tx.type === "income" ? (
                              <Money
                                amount={tx.amount}
                                currency={tx.currency}
                                sign
                                className="font-semibold text-income"
                              />
                            ) : (
                              <Money
                                amount={-tx.amount}
                                currency={tx.currency}
                                className="font-semibold text-ink-1"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="💸"
                title="No transactions yet"
                hint="Use quick add on the right — it takes seconds."
              />
            )}
          </GlassCard>

        </div>
      )}
    </>
  );
}

/** inline expense/income entry right on the dashboard */
function QuickAdd({ className = "" }: { className?: string }) {
  const { state, update } = useStore();
  const base = state.settings.baseCurrency;

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(base);
  const [categoryId, setCategoryId] = useState(
    () => state.categories.find((c) => c.kind === "expense")?.id ?? "",
  );
  const [note, setNote] = useState("");
  const [savedTick, setSavedTick] = useState(false);

  const categories = state.categories.filter((c) => c.kind === type);
  const parsed = parseAmount(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && categoryId !== "";

  const switchType = (t: TxType) => {
    setType(t);
    setCategoryId(state.categories.find((c) => c.kind === t)?.id ?? "");
  };

  const submit = () => {
    if (!valid) return;
    update((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        {
          id: uid(),
          type,
          amount: parsed,
          currency,
          categoryId,
          date: todayISO(),
          note: note.trim() || undefined,
        },
      ],
    }));
    setAmount("");
    setNote("");
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1600);
  };

  return (
    <GlassCard title="Quick add" icon="⚡" className={className}>
      <div className="space-y-3">
        <SegmentedControl
          options={[
            { value: "expense" as TxType, label: "Expense" },
            { value: "income" as TxType, label: "Income" },
          ]}
          value={type}
          onChange={switchType}
        />
        <TextInput
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
        />
        <SegmentedControl
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={currency}
          onChange={setCurrency}
        />
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </Select>
        <TextInput
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
        />
        <Button className="w-full" onClick={submit} disabled={!valid}>
          {savedTick ? "Added ✓" : "Add for today"}
        </Button>
      </div>
    </GlassCard>
  );
}
