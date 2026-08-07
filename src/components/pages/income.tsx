"use client";

import { useState } from "react";
import {
  CategoryBreakdown,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  FieldSet,
  GlassCard,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
  TripleMoney,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  breakdownTotal,
  incomeByCategory,
  monthlySeries,
  taxPaid,
  taxedNet,
} from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { uid, useStore } from "@/lib/store";
import type { Currency, IncomeBreakdown, Transaction } from "@/lib/types";

type Mode = "amount" | "contract";

interface IncomeForm {
  id: string | null;
  mode: Mode;
  categoryId: string;
  currency: Currency;
  date: string;
  note: string;
  /** account the money landed in ("" = unassigned, moves no balance) */
  accountId: string;
  /** apply ФОП tax to the gross figure below */
  applyTax: boolean;
  // amount mode (holds the gross when tax is applied)
  amount: string;
  // contract mode
  days: string;
  dailyRate: string;
  premium: string;
  compensations: string;
  cutoffs: string;
}

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: "amount", label: "Amount" },
  { value: "contract", label: "Day rate" },
];

function parseOptional(input: string): number {
  if (input.trim() === "") return 0;
  return parseAmount(input);
}

/** one-line summary of a day-rate breakdown, e.g. "21d × €56  +€20  −€21" */
function breakdownSummary(b: IncomeBreakdown, currency: Currency): string {
  const parts = [`${b.days}d × ${formatMoney(b.dailyRate, currency, { exact: true })}`];
  if (b.premium) parts.push(`+${formatMoney(b.premium, currency)}`);
  if (b.compensations) parts.push(`+${formatMoney(b.compensations, currency)}`);
  if (b.cutoffs) parts.push(`−${formatMoney(b.cutoffs, currency)}`);
  return parts.join("  ");
}

export function IncomePage() {
  const { state, update } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();

  const incomeCategories = state.categories.filter((c) => c.kind === "income");
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const firstIncomeCat = incomeCategories[0]?.id ?? "";

  const [form, setForm] = useState<IncomeForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* ---------- income transactions ---------- */

  const incomeTx = state.transactions.filter((t) => t.type === "income");
  /*
   * A salary rule posts a year ahead, so "newest first" opened on twelve
   * months of next year's pay before a single thing that had actually arrived.
   * The list defaults to what has landed; the rest is one tap away.
   */
  const today = todayISO();
  const plannedCount = incomeTx.filter((t) => t.date > today).length;
  const [scope, setScope] = useState<"received" | "planned" | "all">("received");
  const visibleTx = incomeTx.filter((t) =>
    scope === "all" ? true : scope === "planned" ? t.date > today : t.date <= today,
  );
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of visibleTx) {
    const m = monthOf(tx.date);
    const list = byMonth.get(m);
    if (list) list.push(tx);
    else byMonth.set(m, [tx]);
  }
  const months = [...byMonth.keys()].sort().reverse();

  /* ---------- stats ---------- */

  const series = monthlySeries(state.transactions, nowMonth, 12, settings);
  const [chartMonths, setChartMonths] = useState(12);
  const chartSeries = monthlySeries(state.transactions, nowMonth, chartMonths, settings);
  const thisMonth = series[series.length - 1].income;
  const withIncome = series.filter((m) => m.income > 0).slice(-6);
  const avg6 =
    withIncome.reduce((s, m) => s + m.income, 0) / Math.max(1, withIncome.length);
  const ytdMonths = series.filter((m) => m.month.slice(0, 4) === nowMonth.slice(0, 4));
  const ytd = ytdMonths.reduce((s, m) => s + m.income, 0);
  const monthsSoFar = Math.max(1, ytdMonths.length);
  // the strongest month in the window, for context under the average
  const bestMonth = series.reduce<(typeof series)[number] | null>(
    (best, m) => (m.income > 0 && (!best || m.income > best.income) ? m : best),
    null,
  );

  const trailingStart = addMonths(nowMonth, -11);
  const byCategory = incomeByCategory(state.transactions, trailingStart, nowMonth, settings);
  const last12Total = [...byCategory.values()].reduce((s, v) => s + v, 0);
  const catSegments: BreakdownSegment[] = [...byCategory.entries()].map(
    ([categoryId, value]) => {
      const cat = catById.get(categoryId);
      return {
        id: categoryId,
        label: cat?.name ?? "Uncategorized",
        icon: cat?.icon ?? "💰",
        value,
        colorSlot: cat?.colorSlot ?? 3,
      };
    },
  );

  /*
   * Which money it arrived in, over the same twelve months. The breakdown above
   * says who paid; in an app built around ₴ / $ / € this says in what — and it
   * is the only place the native totals appear outside the individual rows.
   */
  const byCurrency = CURRENCIES.map((currency) => {
    const rows = incomeTx.filter(
      (t) => t.currency === currency && t.date <= today && monthOf(t.date) >= trailingStart,
    );
    const native = rows.reduce((sum, t) => sum + t.amount, 0);
    return {
      currency,
      native,
      base: convert(native, currency, base, settings.rates),
      count: rows.length,
    };
  }).filter((c) => c.native > 0);
  const byCurrencyTotal = byCurrency.reduce((s, c) => s + c.base, 0);

  /*
   * Every taxed row already carries its gross and the rate applied, so the app
   * has always known this figure exactly — it just never added it up. On a
   * simplified scheme the year turns on it, and until now the only way to see it
   * was to open each entry in turn.
   */
  const yearStart = `${nowMonth.slice(0, 4)}-01`;
  const tax = taxPaid(state.transactions, yearStart, nowMonth, settings);

  /* ---------- form handlers ---------- */

  const openAdd = () =>
    setForm({
      id: null,
      mode: "amount",
      categoryId: firstIncomeCat,
      currency: base,
      date: todayISO(),
      note: "",
      accountId: state.savings[0]?.id ?? "",
      applyTax: false,
      amount: "",
      days: "",
      dailyRate: "",
      premium: "",
      compensations: "",
      cutoffs: "",
    });

  const openEdit = (tx: Transaction) => {
    const b = tx.breakdown;
    // in amount mode the field holds the gross, so a taxed row shows its pre-tax figure
    const amountField = b ? "" : String(tx.tax ? tx.tax.gross : tx.amount);
    setForm({
      id: tx.id,
      mode: b ? "contract" : "amount",
      categoryId: tx.categoryId,
      currency: tx.currency,
      date: tx.date,
      note: tx.note ?? "",
      accountId: tx.accountId ?? "",
      applyTax: tx.tax != null,
      amount: amountField,
      days: b ? String(b.days) : "",
      dailyRate: b ? String(b.dailyRate) : "",
      premium: b?.premium ? String(b.premium) : "",
      compensations: b?.compensations ? String(b.compensations) : "",
      cutoffs: b?.cutoffs ? String(b.cutoffs) : "",
    });
  };

  const closeSheet = () => setForm(null);

  // live gross of whatever is being entered
  const gross = (() => {
    if (!form) return NaN;
    if (form.mode === "amount") return parseAmount(form.amount);
    const days = parseOptional(form.days);
    const rate = parseOptional(form.dailyRate);
    if (!Number.isFinite(days) || !Number.isFinite(rate)) return NaN;
    return (
      days * rate +
      parseOptional(form.premium) +
      parseOptional(form.compensations) -
      parseOptional(form.cutoffs)
    );
  })();
  const net =
    form && form.applyTax && Number.isFinite(gross)
      ? taxedNet(gross, form.currency, settings.tax, settings)
      : gross;

  /**
   * Why Save is off, derived from the form rather than discovered on click.
   * The three form pages each had their own answer to this: Expenses disabled
   * Save and said why, Income and Balance let you press it and then printed a
   * red line at the bottom of a panel that scrolls — so on a long form the
   * button appeared to do nothing at all. One idiom now, and it is this one.
   */
  const problem: string | null = (() => {
    if (!form) return null;
    if (!form.categoryId) return "Pick a category.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "Pick a date.";
    if (form.mode === "contract") {
      const days = parseOptional(form.days);
      if (!Number.isFinite(days) || days < 0 || days > 31)
        return "Working days must be between 0 and 31.";
      if (
        [form.dailyRate, form.premium, form.compensations, form.cutoffs]
          .map(parseOptional)
          .some((n) => !Number.isFinite(n) || n < 0)
      )
        return "Rate, premium, compensations and cut-offs must be non-negative.";
    }
    if (!Number.isFinite(gross) || gross <= 0)
      return "Enter an amount greater than zero.";
    if (!Number.isFinite(net) || net <= 0)
      return "After tax this comes out at zero or less — check the amount.";
    return null;
  })();
  const valid = form !== null && problem === null;

  const submit = () => {
    if (!form || !valid) return;

    const breakdown: IncomeBreakdown | undefined =
      form.mode === "contract"
        ? {
            days: parseOptional(form.days),
            dailyRate: parseOptional(form.dailyRate),
            premium: parseOptional(form.premium),
            compensations: parseOptional(form.compensations),
            cutoffs: parseOptional(form.cutoffs),
          }
        : undefined;

    const grossTotal = breakdown ? breakdownTotal(breakdown) : parseAmount(form.amount);
    const tax = form.applyTax
      ? {
          ratePct: settings.tax.ratePct,
          fixedUAH: settings.tax.fixedUAH,
          gross: grossTotal,
        }
      : undefined;
    const netTotal = tax
      ? taxedNet(grossTotal, form.currency, settings.tax, settings)
      : grossTotal;

    const patch = {
      type: "income" as const,
      amount: netTotal,
      currency: form.currency,
      categoryId: form.categoryId,
      date: form.date,
      note: form.note.trim() || undefined,
      accountId: form.accountId || undefined,
      breakdown,
      tax,
    };

    update((s) => ({
      ...s,
      transactions: form.id
        ? s.transactions.map((t) => (t.id === form.id ? { ...t, ...patch } : t))
        : [...s.transactions, { id: uid(), ...patch }],
    }));
    closeSheet();
  };

  const deleteIncome = () => {
    const id = form?.id;
    if (!id) return;
    update(
      (s) => ({
        ...s,
        transactions: s.transactions.filter((t) => t.id !== id),
      }),
      "Income deleted",
    );
    closeSheet();
  };

  const hasIncome = incomeTx.length > 0;

  return (
    <>
      <PageHeader
        title="Income"
        subtitle="Salary, freelance, interest, sales — anything that comes in"
        action={<Button onClick={openAdd}>+ Add income</Button>}
      />

      <div className="stagger grid grid-cols-2 items-start gap-4 sm:gap-5 xl:grid-cols-12">
        <StatTile
          className="xl:col-span-3"
          label="This month"
          value={formatMoney(thisMonth, base, { compact: true })}
          tone="income"
          spark={series.map((m) => m.income)}
          delta={{
            text: `${formatMoney(thisMonth - avg6, base, { compact: true, sign: true })} vs your 6-month average`,
            good: thisMonth >= avg6,
          }}
        />
        <StatTile
          className="xl:col-span-3"
          label="Average (6 mo)"
          value={formatMoney(avg6, base, { compact: true })}
          spark={series.slice(-6).map((m) => m.income)}
          hint={
            bestMonth
              ? `best so far: ${formatMoney(bestMonth.income, base, { compact: true })} in ${formatMonthShort(bestMonth.month)}`
              : undefined
          }
        />
        <StatTile
          className="xl:col-span-3"
          label={`${nowMonth.slice(0, 4)} year to date`}
          value={formatMoney(ytd, base, { compact: true })}
          hint={`${formatMoney(ytd / monthsSoFar, base, { compact: true })}/mo across ${monthsSoFar} month${monthsSoFar === 1 ? "" : "s"}`}
        />

        {/* the fourth tile: what the ФОП toggle has actually cost this year */}
        <StatTile
          className="xl:col-span-3"
          label={`${nowMonth.slice(0, 4)} tax`}
          value={tax.entries > 0 ? formatMoney(tax.tax, base, { compact: true }) : "—"}
          tone={tax.entries > 0 ? "expense" : undefined}
          hint={
            tax.entries > 0
              ? `${formatPercent((tax.tax / tax.gross) * 100)} of ${formatMoney(tax.gross, base, { compact: true })} gross · ${tax.entries} taxed`
              : "no taxed income recorded this year"
          }
        />

        <GlassCard
          title="Income by month"
          subtitle="What came in each month"
          icon={<Icon name="chart" />}
          action={<PeriodTabs value={chartMonths} onChange={setChartMonths} />}
          className="col-span-2 xl:col-span-12"
        >
          {hasIncome ? (
            <MonthlyColumns
              data={chartSeries.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
              currency={base}
            />
          ) : (
            <EmptyState
              icon={<Icon name="chart" />}
              title="No income recorded yet"
              hint="Add your first income and the chart fills in."
              action={<Button onClick={openAdd}>+ Add income</Button>}
            />
          )}
        </GlassCard>

        <GlassCard
          title="All income"
          subtitle={
            scope === "planned"
              ? "Booked ahead by recurring rules"
              : scope === "all"
                ? "Received and planned, newest first"
                : "Newest first"
          }
          icon={<Icon name="receipt" />}
          action={
            plannedCount > 0 ? (
              <SegmentedControl
                size="sm"
                label="Which income to show"
                options={[
                  { value: "received", label: "Received" },
                  { value: "planned", label: `Planned (${plannedCount})` },
                  { value: "all", label: "All" },
                ]}
                value={scope}
                onChange={setScope}
              />
            ) : undefined
          }
          // Eight columns, not twelve: at full width a row was an icon, a
          // word and an amount separated by half a metre of nothing. It leads
          // its row in the markup too — `order` used to put it there visually
          // while the tab key still went to the two summary cards first.
          // second in the DOM so the summaries reach a phone first, first in
          // the row on a wide screen where both are visible at once
          className="order-2 col-span-2 xl:order-1 xl:col-span-8"
        >
          {!hasIncome ? (
            <EmptyState
              icon={<Icon name="banknote" />}
              title="No income yet"
              hint="Log a salary, a freelance gig, interest, a gift, or something you sold — a simple amount is enough, or use the day-rate calculator for contract work."
              action={<Button onClick={openAdd}>+ Add income</Button>}
            />
          ) : (
            <div className="stagger space-y-5">
              {months.map((month) => {
                const rows = byMonth
                  .get(month)!
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
                const subtotal = rows.reduce(
                  (sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates),
                  0,
                );
                return (
                  <section key={month}>
                    <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                      <h3 className="label font-semibold text-ink-1">
                        {formatMonth(month)}
                      </h3>
                      <span className="tnum label font-semibold text-income">
                        {formatMoney(subtotal, base, { sign: true })}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {rows.map((tx) => {
                        const cat = catById.get(tx.categoryId);
                        const account = tx.accountId
                          ? accountById.get(tx.accountId)
                          : undefined;
                        // everything worth saying about the row that its title
                        // does not already say; the month is the last resort
                        // when a bare amount would otherwise stand alone
                        const details = [
                          tx.note ? (cat?.name ?? "Income") : null,
                          account?.name ?? null,
                          tx.breakdown ? breakdownSummary(tx.breakdown, tx.currency) : null,
                          tx.tax
                            ? `net of ${formatMoney(tx.tax.gross - tx.amount, tx.currency)} tax`
                            : null,
                        ].filter(Boolean);
                        if (details.length === 0) details.push(formatMonth(monthOf(tx.date)));
                        return (
                          <li key={tx.id}>
                            <button
                              type="button"
                              onClick={() => openEdit(tx)}
                              className="row-tap flex w-full items-center gap-3 px-2 py-2 text-left"
                            >
                              <span
                                aria-hidden
                                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base"
                              >
                                {cat?.icon ?? "💰"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink-1">
                                  {tx.note || cat?.name || "Income"}
                                </span>
                                <span className="block truncate text-xs text-ink-3">
                                  {details.join(" · ")}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="tnum block text-sm font-semibold text-income">
                                  {formatMoney(tx.amount, tx.currency, { sign: true, exact: true })}
                                </span>
                                <span className="block text-xs text-ink-3">
                                  {tx.currency !== base && (
                                    <span className="tnum">
                                      ≈ {formatMoney(
                                        convert(tx.amount, tx.currency, base, settings.rates),
                                        base,
                                        { compact: true },
                                      )}{" · "}
                                    </span>
                                  )}
                                  {formatDateShort(tx.date)}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* the side column: both summaries stack beside the ledger rather than
            each starting a row of its own with empty page next to it */}
        <div className="order-1 col-span-2 flex flex-col gap-4 self-start sm:gap-5 xl:order-2 xl:col-span-4">
        <GlassCard
          title="By source"
          subtitle="Last 12 months"
          icon={<Icon name="pie" />}
        >
          {catSegments.length > 0 ? (
            <>
              <div className="mb-3.5 flex items-end justify-between gap-3">
                <p className="num-md whitespace-nowrap text-ink-1">
                  {formatMoney(last12Total, base, { compact: true })}
                </p>
                <p className="text-xs text-ink-3">
                  {catSegments.length} source{catSegments.length === 1 ? "" : "s"} ·{" "}
                  {formatMoney(last12Total / 12, base, { compact: true })}/mo on average
                </p>
              </div>
              <CategoryBreakdown segments={catSegments} currency={base} maxSegments={7} />
            </>
          ) : (
            <EmptyState
              icon={<Icon name="pie" />}
              title="Nothing to break down yet"
              hint="Once you log a few incomes, you’ll see where your money comes from."
            />
          )}
        </GlassCard>

        {byCurrency.length > 0 && (
          <GlassCard
            title="By currency"
            subtitle="Last 12 months, as received"
            icon={<Icon name="exchange" />}
          >
            <ul className="space-y-3">
              {byCurrency.map((c) => (
                <li key={c.currency}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink-1">{c.currency}</span>
                    <span className="tnum text-sm font-semibold text-ink-1">
                      {formatMoney(c.native, c.currency, { compact: true })}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ghost"
                    role="img"
                    aria-label={`${c.currency}: ${formatPercent((c.base / Math.max(1, byCurrencyTotal)) * 100, 0)}`}
                  >
                    <div
                      className="bar-slice h-full rounded-full bg-income"
                      style={{ width: `${(c.base / Math.max(1, byCurrencyTotal)) * 100}%` }}
                    />
                  </div>
                  <p className="tnum mt-1 text-xs text-ink-3">
                    {c.currency === base
                      ? `${c.count} ${c.count === 1 ? "entry" : "entries"}`
                      : `≈ ${formatMoney(c.base, base, { compact: true })} · ${c.count} ${c.count === 1 ? "entry" : "entries"}`}
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        </div>
      </div>

      {form && (
        <Sheet
          open
          onClose={closeSheet}
          onSubmit={submit}
          problem={problem}
          title={form.id ? "Edit income" : "New income"}
          footer={
            <>
              {form.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={closeSheet}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid}>
                Save
              </Button>
            </>
          }
        >
          <SegmentedControl
            label="How the amount is entered"
            options={MODE_OPTIONS}
            value={form.mode}
            onChange={(mode) => setForm({ ...form, mode })}
          />
          {form.mode === "contract" && (
            <p className="-mt-1 text-xs text-ink-3">
              For contract work billed per day: days × rate + premium + compensations −
              cut-offs.
            </p>
          )}

          <Field label="Category">
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })}
            />
          </FieldSet>

          {form.mode === "amount" ? (
            <Field label="Amount">
              <TextInput
                inputMode="decimal"
                prefix={CURRENCY_SYMBOL[form.currency]}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0"
              />
            </Field>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Working days">
                  <TextInput
                    inputMode="decimal"
                    value={form.days}
                    onChange={(e) => setForm({ ...form, days: e.target.value })}
                    placeholder="21"
                  />
                </Field>
                <Field label="Daily rate">
                  <TextInput
                    inputMode="decimal"
                    prefix={CURRENCY_SYMBOL[form.currency]}
                    value={form.dailyRate}
                    onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                    placeholder="56"
                  />
                </Field>
              </div>
              {/* three number fields abreast on a 320px phone leaves ~60px of
                  typing room each and wraps "Compensations" onto two lines, so
                  the row comes out ragged; they pair up from `sm` instead */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Premium">
                  <TextInput
                    inputMode="decimal"
                    value={form.premium}
                    onChange={(e) => setForm({ ...form, premium: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Compensations">
                  <TextInput
                    inputMode="decimal"
                    value={form.compensations}
                    onChange={(e) => setForm({ ...form, compensations: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="Cut-offs">
                  <TextInput
                    inputMode="decimal"
                    value={form.cutoffs}
                    onChange={(e) => setForm({ ...form, cutoffs: e.target.value })}
                    placeholder="0"
                  />
                </Field>
              </div>
            </>
          )}

          <Field label={form.mode === "contract" ? "Source" : "Note"}>
            <TextInput
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={form.mode === "contract" ? "Client or employer" : "Optional"}
            />
          </Field>

          <Field label="Date">
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>

          {/* income that names no account is a figure in a report; income that
              names one is money that actually arrived somewhere, and the
              balance on Balance moves with it */}
          <Field
            label="Landed in"
            hint={
              state.savings.length === 0
                ? "Add an account on Balance to have income move a real balance"
                : "Which account the money arrived in"
            }
          >
            <Select
              value={form.accountId}
              onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            >
              <option value="">— not assigned —</option>
              {state.savings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-start justify-between gap-3 rounded-field bg-ghost px-4 py-3">
            <div className="min-w-0">
              <p className="body-strong">Apply ФОП tax</p>
              <p className="mt-0.5 text-xs text-ink-3">
                −{formatPercent(settings.tax.ratePct)} −{formatMoney(settings.tax.fixedUAH, "UAH")} from the gross
              </p>
            </div>
            <Switch
              checked={form.applyTax}
              onChange={(v) => setForm({ ...form, applyTax: v })}
              label="Apply ФОП tax"
            />
          </div>

          {Number.isFinite(net) && net > 0 && (
            <div className="rounded-field bg-ghost p-4">
              {form.applyTax && Number.isFinite(gross) && (
                <div className="mb-3 space-y-1 border-b border-hairline pb-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-2">Gross</span>
                    <span className="tnum text-ink-1">
                      {formatMoney(gross, form.currency, { exact: true })}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-2">Tax</span>
                    <span className="tnum text-expense">
                      −{formatMoney(gross - net, form.currency, { exact: true })}
                    </span>
                  </div>
                </div>
              )}
              <p className="mb-1 label">
                {form.applyTax ? "Net take-home" : "In every currency"}
              </p>
              <TripleMoney amount={net} currency={form.currency} settings={settings} />
            </div>
          )}
        </Sheet>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteIncome}
        title="Delete this income?"
        message="The record will be removed permanently. This cannot be undone."
      />
    </>
  );
}
