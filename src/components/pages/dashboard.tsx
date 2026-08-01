"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  Field,
  FieldSet,
  GlassCard,
  LinkButton,
  Money,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Select,
  TextInput,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import {
  addDays,
  addMonths,
  currentMonth,
  dateInMonth,
  daysBetween,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
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

// Three slices means every pair touches, so this trio has to clear the *all-
// pairs* gate, not just the adjacent one. Slots 1+2+3 (teal, amber, violet) do,
// in both themes — worst pair ΔE 12.4 light / 8.9 dark under deuteranopia. The
// previous trio reached for slot 5 and collapsed to ΔE 1.9 in dark mode: teal
// and rose are the same colour to a deuteranope.
const CURRENCY_SLOT: Record<Currency, number> = { UAH: 1, USD: 2, EUR: 3 };

function CardLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      // Ink, not accent. The brand green already means "this is the chip / row /
      // tab you picked" *and* "this number went up"; spending it on navigation
      // as well left no way to tell a verdict from a control at a glance. The
      // chip's border and its arrow are enough to say this goes somewhere.
      className="group inline-flex items-center gap-1 rounded-full border border-hairline bg-ghost px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-[color-mix(in_oklab,var(--ink-3)_28%,var(--hairline))] hover:bg-ghost-2 hover:text-ink-1"
    >
      All
      {/* the arrow leads the way on hover — the one bit of motion that says
          "this goes somewhere" without the card itself moving */}
      <Icon
        name="arrowRight"
        size={13}
        strokeWidth={2.4}
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
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
  // the figure the hero is about, a month ago — "768,776 ₴" alone says nothing
  // about which way it is going, and the card had the room to say it
  const worthAMonthAgo = netWorth(state, dateInMonth(addMonths(month, -1), Number(today.slice(8))));
  const worthDelta = worth.total - worthAMonthAgo.total;
  const worthDeltaPct =
    worthAMonthAgo.total > 0 ? (worthDelta / worthAMonthAgo.total) * 100 : 0;

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
  // A month's totals count every row dated inside it, and recurring rules and
  // subscriptions post a year ahead — so on the 2nd the "Expenses" tile already
  // carries the rent due on the 25th. Split out what has not happened yet
  // rather than letting the figure read as money already gone.
  const planned = (type: "income" | "expense") =>
    state.transactions
      .filter((t) => t.type === type && monthOf(t.date) === month && t.date > today)
      .reduce((sum, t) => sum + convert(t.amount, t.currency, base, settings.rates), 0);
  const plannedIncome = planned("income");
  const plannedExpense = planned("expense");
  /** splits a month's figure into what has happened and what is still booked */
  const soFar = (total: number, ahead: number) =>
    ahead > 0
      ? `${formatMoney(total - ahead, base, { compact: true })} so far · ${formatMoney(ahead, base, { compact: true })} planned`
      : undefined;
  // a month with nothing in it is not a comparison — "+26K vs last month" on a
  // fresh database says more about the empty month than about this one
  const hasPrevious = previous.income > 0 || previous.expense > 0;
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
        <ProgressMeter
          value={spent}
          max={budget.limit}
          tone="budget"
          label={`${state.categories.find((c) => c.id === categoryId)?.name ?? "Category"} budget`}
        />
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
  const allHoldings = holdings(state, today);
  // The slot comes from where a holding sits in your own list, not from where
  // it lands in this sort: colour follows the entity, never its rank (see
  // Category.colorSlot). Keyed on rank, a deposit maturing past a savings
  // account swapped both their colours between two visits to the page.
  const holdingSlot = new Map(allHoldings.map((h, i) => [h.id, (i % 8) + 1]));
  const holdingRows = allHoldings
    .filter((h) => h.base > 0)
    .sort((a, b) => b.base - a.base);
  const holdingSegments: BreakdownSegment[] = holdingRows.map((h) => ({
    id: h.id,
    label: h.label,
    icon: h.icon,
    value: h.base,
    colorSlot: holdingSlot.get(h.id) ?? 1,
  }));
  /** what a foreign-currency holding is worth in its own money */
  const holdingNative = (id: string): ReactNode => {
    const row = holdingRows.find((h) => h.id === id);
    if (!row || row.currency === base) return null;
    return (
      <p className="tnum mt-0.5 pl-5 text-xs text-ink-3">
        {formatMoney(row.native, row.currency, { exact: true })}
      </p>
    );
  };

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

  /*
   * What the standing arrangements will do next. Recurring rules and
   * subscriptions post a year ahead, so the ledger already knows every charge
   * that is coming — it just had nowhere on the dashboard to say so. This
   * replaced a five-year projection that repeated the Forecast page and
   * answered a question nobody asks on a Tuesday.
   */
  /*
   * Where the net worth has actually been, month by month, split the same way
   * the hero splits it. The dashboard could show the balance today and a
   * five-year guess, but nothing in between — and the twelve months you have
   * lived through are the part you can act on.
   */
  const worthHistory: AreaPoint[] = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(month, -(11 - i));
    // past months close on their last day; the running month stops at today so
    // postings dated later this month do not inflate the final point
    const asOf = m === month ? today : dateInMonth(m, 31);
    const w = netWorth(state, asOf);
    return { label: m, a: w.savings, b: w.investments };
  });
  const worthHistoryHasData = worthHistory.some((p) => p.a + p.b > 0);

  const UPCOMING_DAYS = 30;
  const upcomingUntil = addDays(today, UPCOMING_DAYS);
  const upcoming = state.transactions
    .filter((t) => t.type !== "transfer" && t.date > today && t.date <= upcomingUntil)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const upcomingSum = (type: "income" | "expense") =>
    upcoming
      .filter((t) => t.type === type)
      .reduce((sum, t) => sum + convert(t.amount, t.currency, base, settings.rates), 0);
  const upcomingOut = upcomingSum("expense");
  const upcomingIn = upcomingSum("income");
  const shownUpcoming = upcoming.slice(0, 7);

  // exclude planned (future-dated) postings so they don't masquerade as recent
  // — those have their own card now
  const recent = state.transactions
    .filter((t) => t.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 9);

  const hasAnyData =
    state.transactions.length > 0 ||
    state.savings.length > 0 ||
    state.investments.length > 0 ||
    state.debts.length > 0;

  const otherCurrencies = CURRENCIES.filter((c) => c !== base);

  return (
    <>
      {/* the same header every other page uses — this one was hand-built, with
          its own alignment and its own place for the second line */}
      <PageHeader
        title="Dashboard"
        subtitle={formatMonth(month)}
        action={
          <SegmentedControl
            label="Base currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={base}
            onChange={(v: Currency) =>
              update((s) => ({ ...s, settings: { ...s.settings, baseCurrency: v } }))
            }
            className="w-44"
          />
        }
      />

      {!hasAnyData ? (
        <GlassCard className="glow">
          <EmptyState
            icon={<Icon name="sparkle" />}
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
        // Two columns on phones so the month tiles pair up instead of each
        // taking a full screen-width row, six from a laptop and twelve on a
        // wide desktop. The middle step matters: between 1024 and 1280 every
        // card used to sit alone on a full-width row, which is where the page
        // read as mostly empty.
        <div className="stagger grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-6 xl:grid-cols-12">
          {/* hero: net worth, spans two rows next to tiles + cash flow */}
          <GlassCard className="glow col-span-2 lg:col-span-6 xl:col-span-4 xl:row-span-2">
            <div>
              <p className="card-title">Net worth</p>
              <p className="hero-number num-hero mt-3">{formatMoney(worth.total, base)}</p>
              <p className="tnum mt-2 text-[15px] text-ink-2">
                {otherCurrencies
                  .map((c) =>
                    formatMoney(convert(worth.total, base, c, settings.rates), c, {
                      exact: true,
                    }),
                  )
                  .join("  ·  ")}
              </p>
              {worthAMonthAgo.total !== 0 && worthDelta !== 0 && (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span
                    className={`tnum font-semibold ${worthDelta >= 0 ? "text-income" : "text-expense"}`}
                  >
                    {formatMoney(worthDelta, base, { compact: true, sign: true })}
                  </span>
                  <span className="text-ink-3">
                    ({worthDelta >= 0 ? "+" : "−"}
                    {Math.abs(worthDeltaPct).toFixed(1)}%) in a month
                  </span>
                </p>
              )}
            </div>
            {/* centred in whatever height the hero inherits from the two rows
                beside it, so the breathing room sits above and below the list
                instead of collecting under it */}
            <div className="mt-6 flex flex-1 flex-col justify-center space-y-2.5 border-t border-hairline pb-2 pt-4 text-sm">
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
                      className="bar-slice bg-series-1"
                      style={{ width: `${(worth.savings / worth.assets) * 100}%` }}
                    />
                    <div
                      className="bar-slice bg-series-2"
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
            {/* pinned to the bottom edge: the hero spans two rows, so whatever
                height the tiles and the chart beside it end up with, the slack
                sits between the blocks rather than pooling under the last one */}
            <div className="mt-auto flex items-end justify-between gap-3 border-t border-hairline pt-4">
              <div className="min-w-0">
                <p className="card-title">Runway</p>
                <p className="num-sm mt-1 text-ink-1">{runwayLabel}</p>
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
            className="lg:col-span-3 xl:col-span-2"
            label="Income"
            href="/income"
            value={formatMoney(current.income, base, { compact: true })}
            tone="income"
            spark={series.map((m) => m.income)}
            delta={
              hasPrevious
                ? {
                    text: `${formatMoney(current.income - previous.income, base, { compact: true, sign: true })} vs last month`,
                    good: current.income >= previous.income,
                  }
                : undefined
            }
            hint={soFar(current.income, plannedIncome)}
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label="Expenses"
            href="/transactions"
            value={formatMoney(current.expense, base, { compact: true })}
            tone="expense"
            spark={series.map((m) => m.expense)}
            delta={
              hasPrevious
                ? {
                    text: `${formatMoney(current.expense - previous.expense, base, { compact: true, sign: true })} vs last month`,
                    // spending less than last month is the good direction
                    good: current.expense <= previous.expense,
                  }
                : undefined
            }
            hint={soFar(current.expense, plannedExpense)}
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label="Net flow"
            value={formatMoney(current.net, base, { compact: true, sign: true })}
            spark={series.map((m) => m.net)}
            delta={
              hasPrevious
                ? {
                    text: `${formatMoney(netDelta, base, { compact: true, sign: true })} vs last month`,
                    good: current.net >= previous.net,
                  }
                : undefined
            }
          />
          <StatTile
            className="lg:col-span-3 xl:col-span-2"
            label="Savings rate"
            value={current.income > 0 ? formatPercent(savingsRate(current)) : "—"}
            spark={series.map(savingsRate)}
            delta={
              current.income > 0 && previous.income > 0 && hasPrevious
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
            icon={<Icon name="chart" />}
            action={<PeriodTabs value={cashMonths} onChange={setCashMonths} />}
            className="col-span-2 lg:col-span-6 xl:col-span-8"
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
                icon={<Icon name="chart" />}
                title="No data for the chart yet"
                hint="Record income and expenses to see the monthly dynamic."
                action={<LinkButton href="/transactions">Add a transaction</LinkButton>}
              />
            )}
          </GlassCard>

          {/* the second trend, under the first: cash flow is what moved through
              the month, this is what it left behind */}
          {worthHistoryHasData && (
            <GlassCard
              title="Net worth · last 12 months"
              subtitle="Accounts and investments, as they stood each month"
              icon={<Icon name="trend" />}
              action={<CardLink href="/balance" />}
              className="col-span-2 lg:col-span-6 xl:col-span-12"
            >
              <StackedArea
                points={worthHistory}
                currency={base}
                seriesA="Accounts"
                seriesB="Investments"
                height={260}
                xTickEvery={2}
                xTickFormat={(label) => formatMonthShort(label)}
              />
            </GlassCard>
          )}

          {/* breakdowns row */}
          <GlassCard
            title="Spending by category"
            icon={<Icon name="spend" />}
            action={<CardLink href="/transactions" />}
            // the longest of the three breakdowns: it takes the full laptop row
            // and lets the two shorter ones pair up underneath
            className="col-span-2 lg:col-span-6 xl:col-span-4"
          >
            {segments.length > 0 ? (
              <>
                {/* headline first: what the breakdown below adds up to, and
                    whether that is more or less than the month before */}
                <div className="mb-3.5 flex items-end justify-between gap-3">
                  <p className="num-md whitespace-nowrap text-ink-1">
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
                icon={<Icon name="receipt" />}
                title="No spending this month"
                hint="Add your first expense to see the breakdown."
                action={<LinkButton href="/transactions">Add an expense</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard
            title="Net worth by holding"
            icon={<Icon name="bank" />}
            action={<CardLink href="/balance" />}
            className="col-span-2 lg:col-span-3 xl:col-span-4"
          >
            {holdingSegments.length > 0 ? (
              <>
                <CategoryBreakdown
                  segments={holdingSegments}
                  currency={base}
                  maxSegments={7}
                  rowExtra={holdingNative}
                />
                {/* the card used to stop at the bars, leaving a third of it
                    blank; the split it is actually about belongs here */}
                <div className="mt-auto grid grid-cols-2 gap-3 border-t border-hairline pt-3.5">
                  <div>
                    <p className="card-title">Accounts</p>
                    <p className="num-sm mt-1 text-ink-1">
                      {formatMoney(worth.savings, base, { compact: true })}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {state.savings.length} {state.savings.length === 1 ? "account" : "accounts"}
                    </p>
                  </div>
                  <div>
                    <p className="card-title">Investments</p>
                    <p className="num-sm mt-1 text-ink-1">
                      {formatMoney(worth.investments, base, { compact: true })}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {state.investments.length}{" "}
                      {state.investments.length === 1 ? "position" : "positions"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Icon name="bank" />}
                title="No holdings yet"
                hint="Add accounts and investments on Balance."
                action={<LinkButton href="/balance">Add on Balance</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard title="Currency allocation" icon={<Icon name="globe" />} className="col-span-2 lg:col-span-3 xl:col-span-4">
            {allocationSegments.some((s) => s.value > 0) ? (
              <>
                <Donut
                  segments={allocationSegments.filter((s) => s.value > 0)}
                  currency={base}
                  centerLabel="Held in"
                  // no fixed diameter: the ring is the only thing in the top
                  // half of this card, so it sizes itself to the column instead
                  // of sitting at 190px in the middle of a 460px card
                  legend={false}
                />
                {/* one line per currency instead of a single muted "native
                    amounts: …" run-on under the ring, which was the only place
                    the actual dollars and euros appeared */}
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
                            <span className="tnum block text-xs text-ink-3">
                              {formatMoney(a.base, base, { compact: true })}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  <li className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2 text-xs text-ink-3">
                    <span>
                      1 $ = {settings.rates.USD.toFixed(2)} ₴ · 1 € ={" "}
                      {settings.rates.EUR.toFixed(2)} ₴
                    </span>
                  </li>
                </ul>
              </>
            ) : (
              <EmptyState
                icon={<Icon name="exchange" />}
                title="Nothing to allocate yet"
                hint="Once you hold money in ₴, $ or €, the split shows up here."
              />
            )}
          </GlassCard>

          <GlassCard
            title="Coming up"
            subtitle={`Already booked for the next ${UPCOMING_DAYS} days`}
            icon={<Icon name="calendar" />}
            action={<CardLink href="/transactions" />}
            className="col-span-2 lg:col-span-6 xl:col-span-8"
          >
            {upcoming.length > 0 ? (
              <>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div>
                    <p className="card-title">Going out</p>
                    <p className="num-sm mt-1 text-expense">
                      {formatMoney(upcomingOut, base, { compact: true })}
                    </p>
                  </div>
                  <div>
                    <p className="card-title">Coming in</p>
                    <p className="num-sm mt-1 text-income">
                      {formatMoney(upcomingIn, base, { compact: true })}
                    </p>
                  </div>
                  <div>
                    <p className="card-title">Net</p>
                    <p
                      className={`num-sm mt-1 ${
                        upcomingIn - upcomingOut >= 0 ? "text-ink-1" : "text-expense"
                      }`}
                    >
                      {formatMoney(upcomingIn - upcomingOut, base, {
                        compact: true,
                        sign: true,
                      })}
                    </p>
                  </div>
                </div>
                <ul className="space-y-0.5">
                  {shownUpcoming.map((tx) => {
                    const cat = state.categories.find((c) => c.id === tx.categoryId);
                    const days = daysBetween(today, tx.date);
                    const source = tx.subscriptionId
                      ? "subscription"
                      : tx.recurringId
                        ? "recurring"
                        : "one-off";
                    return (
                      <li
                        key={tx.id}
                        className="flex items-center gap-3 border-b border-hairline px-1 py-2 text-sm last:border-b-0"
                      >
                        <span
                          aria-hidden
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-base"
                          style={{
                            backgroundColor: `color-mix(in oklab, var(--series-${cat?.colorSlot ?? 3}) 20%, transparent)`,
                          }}
                        >
                          {cat?.icon ?? "❓"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-1">
                            {tx.note || cat?.name || "Uncategorized"}
                          </span>
                          <span className="block truncate text-xs text-ink-3">
                            {cat?.name ?? "Uncategorized"} · {source}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tnum block whitespace-nowrap text-xs text-ink-2">
                            {formatDateShort(tx.date)}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {days === 1 ? "tomorrow" : `in ${days} days`}
                          </span>
                        </span>
                        <span className="w-24 shrink-0 text-right">
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
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {upcoming.length > shownUpcoming.length && (
                  <p className="mt-auto pt-3 text-xs text-ink-3">
                    +{upcoming.length - shownUpcoming.length} more before{" "}
                    {formatDateShort(upcomingUntil)}
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                icon={<Icon name="calendar" />}
                title="Nothing booked ahead"
                hint="Recurring payments and subscriptions post themselves in advance — add one and it shows up here."
                action={<LinkButton href="/transactions">Add a recurring payment</LinkButton>}
              />
            )}
          </GlassCard>

          <GlassCard
            title="Subscriptions"
            icon={<Icon name="device" />}
            action={<CardLink href="/transactions" />}
            // fixed-length content: a short list of services and a form have
            // nothing to fill a taller neighbour's height with
            className="col-span-2 self-start lg:col-span-3 xl:col-span-4"
          >
            {activeSubs.length > 0 ? (
              <>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="num-md whitespace-nowrap text-ink-1">
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
                icon={<Icon name="device" />}
                title="No subscriptions tracked"
                hint="Add them once and they post themselves monthly."
                action={<LinkButton href="/transactions">Add subscriptions</LinkButton>}
              />
            )}
          </GlassCard>

          <QuickAdd className="col-span-2 self-start lg:col-span-3 xl:col-span-4" />

          {/* eight columns, not twelve: at full width the five columns drifted
              apart and the card read as mostly gaps. Beside the quick-add form
              it stays dense, and what you just entered lands next to it. */}
          <GlassCard
            title="Recent transactions"
            subtitle={`Last ${recent.length} entries`}
            icon={<Icon name="receipt" />}
            action={<CardLink href="/transactions" />}
            className="col-span-2 lg:col-span-6 xl:col-span-8"
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
                      <th className="py-2 pr-3 text-right font-semibold">Date</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((tx) => {
                      const cat = state.categories.find((c) => c.id === tx.categoryId);
                      const account = state.savings.find((a) => a.id === tx.accountId);
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
                icon={<Icon name="spend" />}
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
  // null means "whatever the base currency is" — the switcher sits at the top
  // of this very page, and a currency pinned at mount went on saying UAH after
  // you moved the dashboard to USD
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const currency = currencyChoice ?? base;
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  // null means "the first account"; like the currency above, pinning an id at
  // mount would keep pointing at one that has since been renamed or deleted
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savedTick, setSavedTick] = useState(false);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (tickTimer.current) clearTimeout(tickTimer.current);
  }, []);

  const categories = state.categories.filter((c) => c.kind === type);
  // likewise the category: pinned at mount it could point at one that has since
  // been renamed away or deleted, while the select showed something else
  const categoryId =
    categoryChoice && categories.some((c) => c.id === categoryChoice)
      ? categoryChoice
      : (categories[0]?.id ?? "");
  // "" is a real choice here (unassigned), so only an id that no longer exists
  // falls back to the first account
  const accountId =
    accountChoice !== null && (accountChoice === "" || state.savings.some((a) => a.id === accountChoice))
      ? accountChoice
      : (state.savings[0]?.id ?? "");
  const parsed = parseAmount(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && categoryId !== "";

  const switchType = (t: TxType) => {
    setType(t);
    setCategoryChoice(null);
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
          // without this a quick-added expense never moves a balance, which is
          // the one thing the rest of the app is built on
          accountId: accountId || undefined,
        },
      ],
    }));
    setAmount("");
    setNote("");
    setSavedTick(true);
    // restart the confirmation on every add: two entries in quick succession
    // used to leave the second one's tick expiring on the first one's timer
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setSavedTick(false), 1600);
  };

  return (
    <GlassCard title="Quick add" icon={<Icon name="bolt" />} className={className}>
      {/* Labelled like every other form in the app. This one carried its names
          in `aria-label` only, so what you actually saw was two adjacent
          dropdowns reading "🍽️ Food" and "💳 Mono" with nothing to say which
          was the category and which the account. */}
      <div className="space-y-3">
        <FieldSet label="Kind">
          <SegmentedControl
            label="Kind"
            options={[
              { value: "expense" as TxType, label: "Expense" },
              { value: "income" as TxType, label: "Income" },
            ]}
            value={type}
            onChange={switchType}
          />
        </FieldSet>
        <Field label="Amount">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            prefix={CURRENCY_SYMBOL[currency]}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <FieldSet label="Currency">
          <SegmentedControl
            label="Currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrencyChoice}
          />
        </FieldSet>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryChoice(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {state.savings.length > 0 && (
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountChoice(e.target.value)}>
              <option value="">— no account —</option>
              {state.savings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note">
          <TextInput
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Button className="w-full" onClick={submit} disabled={!valid}>
          {savedTick ? "Added ✓" : "Add for today"}
        </Button>
      </div>
    </GlassCard>
  );
}
