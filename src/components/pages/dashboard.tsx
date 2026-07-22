"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CategoryBreakdown,
  MonthlyColumns,
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
import { currentMonth, formatDateShort, formatMonth, todayISO } from "@/lib/date";
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
      className="text-sm font-semibold text-accent transition-colors hover:underline"
    >
      All →
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

  const series = monthlySeries(state.transactions, month, 12, settings);
  const current = series[series.length - 1];
  const previous = series[series.length - 2];
  const netDelta = current.net - previous.net;

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
        <p className="mt-1 text-[11px] text-ink-3">
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

  /* forecast preview: 5 years, contribution = avg net of last 3 months */
  const monthlySavings = Math.max(
    0,
    Math.round(averageMonthlyNet(state.transactions, month, 3, settings)),
  );
  const projection = buildProjection(state, today, 60, monthlySavings);
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
          <h1 className="text-2xl font-bold tracking-tight text-ink-1">Dashboard</h1>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          {/* hero: net worth, spans two rows next to tiles + cash flow */}
          <GlassCard className="glow md:col-span-2 xl:col-span-4 xl:row-span-2">
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-2">Subscriptions</span>
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(subsTotal, base, { compact: true })}/mo
                </span>
              </div>
              {worth.total > 0 && (
                <div className="pt-1">
                  <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="bg-series-1"
                      style={{ width: `${(worth.savings / worth.total) * 100}%` }}
                    />
                    <div
                      className="bg-series-5"
                      style={{ width: `${(worth.investments / worth.total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-3">
                    {formatPercent((worth.savings / worth.total) * 100, 0)} accounts ·{" "}
                    {formatPercent((worth.investments / worth.total) * 100, 0)} investments
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* month tiles */}
          <StatTile
            className="xl:col-span-2"
            label="Income"
            value={formatMoney(current.income, base, { compact: true })}
            tone="income"
            spark={series.map((m) => m.income)}
          />
          <StatTile
            className="xl:col-span-2"
            label="Expenses"
            value={formatMoney(current.expense, base, { compact: true })}
            tone="expense"
            spark={series.map((m) => m.expense)}
          />
          <StatTile
            className="xl:col-span-2"
            label="Net flow"
            value={formatMoney(current.net, base, { compact: true, sign: true })}
            delta={{
              text: `${formatMoney(netDelta, base, { compact: true, sign: true })} vs last month`,
              good: current.net >= previous.net,
            }}
          />
          <StatTile
            className="xl:col-span-2"
            label="Savings rate"
            value={
              current.income > 0 ? formatPercent((current.net / current.income) * 100) : "—"
            }
          />

          {/* cash flow — beside the hero on xl */}
          <GlassCard title="12-month cash flow" className="md:col-span-2 xl:col-span-8">
            {state.transactions.length > 0 ? (
              <MonthlyColumns
                data={series.map((m) => ({
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
            action={<CardLink href="/transactions" />}
            className="xl:col-span-4"
          >
            {segments.length > 0 ? (
              <CategoryBreakdown segments={segments} currency={base} rowExtra={budgetExtra} />
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
            action={<CardLink href="/balance" />}
            className="xl:col-span-4"
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

          <GlassCard title="Currency allocation" className="xl:col-span-4">
            {allocationSegments.length > 0 ? (
              <>
                <CategoryBreakdown segments={allocationSegments} currency={base} />
                <p className="mt-3 text-xs text-ink-3">
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

          {/* outlook + subscriptions */}
          {(state.savings.length > 0 || state.investments.length > 0) && (
            <GlassCard
              title="5-year outlook"
              action={<CardLink href="/forecast" />}
              className="md:col-span-2 xl:col-span-8"
            >
              <StackedArea
                points={projectionPoints}
                currency={base}
                height={230}
                xTickEvery={12}
                xTickFormat={(label) => label.slice(0, 4)}
              />
              <p className="mt-3 text-xs text-ink-3">
                Projected net worth in 5 years:{" "}
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(inFiveYears.total, base, { compact: true })}
                </span>{" "}
                — assuming you keep saving {formatMoney(monthlySavings, base, { compact: true })}
                /mo (your 3-month average).
              </p>
            </GlassCard>
          )}

          <GlassCard
            title="Subscriptions"
            action={<CardLink href="/transactions" />}
            className="xl:col-span-4"
          >
            {activeSubs.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-ink-2">
                  {activeSubs.length} active ·{" "}
                  <span className="tnum font-semibold text-ink-1">
                    {formatMoney(subsTotal, base, { compact: true })}/mo
                  </span>{" "}
                  ={" "}
                  <span className="tnum">
                    {formatMoney(subsTotal * 12, base, { compact: true })}/yr
                  </span>
                </p>
                <ul className="space-y-1">
                  {topSubs.map((sub) => (
                    <li key={sub.id} className="flex items-center gap-3 py-1.5">
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ghost text-sm"
                      >
                        {sub.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-1">
                        {sub.name}
                      </span>
                      <Money
                        amount={sub.price}
                        currency={sub.currency}
                        exact
                        className="shrink-0 text-sm font-medium text-ink-1"
                      />
                    </li>
                  ))}
                </ul>
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

          {/* recent + quick add */}
          <GlassCard
            title="Recent transactions"
            action={<CardLink href="/transactions" />}
            className="md:col-span-2 xl:col-span-8"
          >
            {recent.length > 0 ? (
              <ul className="space-y-0.5">
                {recent.map((tx) => {
                  const cat = state.categories.find((c) => c.id === tx.categoryId);
                  return (
                    <li key={tx.id} className="flex items-center gap-3 py-2">
                      <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base"
                      >
                        {cat?.icon ?? "❓"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-1">
                          {cat?.name ?? "Uncategorized"}
                        </p>
                        {tx.note && <p className="truncate text-xs text-ink-3">{tx.note}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-ink-3">
                        {formatDateShort(tx.date)}
                      </span>
                      {tx.type === "income" ? (
                        <Money
                          amount={tx.amount}
                          currency={tx.currency}
                          sign
                          className="shrink-0 text-sm font-semibold text-income"
                        />
                      ) : (
                        <Money
                          amount={-tx.amount}
                          currency={tx.currency}
                          className="shrink-0 text-sm font-semibold text-ink-1"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                icon="💸"
                title="No transactions yet"
                hint="Use quick add on the right — it takes seconds."
              />
            )}
          </GlassCard>

          <QuickAdd className="xl:col-span-4" />
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
    <GlassCard title="Quick add" className={className}>
      <div className="space-y-3">
        <SegmentedControl
          options={[
            { value: "expense" as TxType, label: "Expense" },
            { value: "income" as TxType, label: "Income" },
          ]}
          value={type}
          onChange={switchType}
        />
        <div className="flex gap-2">
          <TextInput
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
            className="flex-1"
          />
          <SegmentedControl
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onChange={setCurrency}
            className="w-40 shrink-0"
          />
        </div>
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
