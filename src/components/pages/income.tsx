"use client";

import { useState } from "react";
import {
  CategoryBreakdown,
  MonthlyColumns,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  GlassCard,
  PageHeader,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
  TripleMoney,
} from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  formatDateShort,
  formatMonth,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  breakdownTotal,
  incomeByCategory,
  monthlySeries,
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
  const firstIncomeCat = incomeCategories[0]?.id ?? "";

  const [form, setForm] = useState<IncomeForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- income transactions ---------- */

  const incomeTx = state.transactions.filter((t) => t.type === "income");
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of incomeTx) {
    const m = monthOf(tx.date);
    const list = byMonth.get(m);
    if (list) list.push(tx);
    else byMonth.set(m, [tx]);
  }
  const months = [...byMonth.keys()].sort().reverse();

  /* ---------- stats ---------- */

  const series = monthlySeries(state.transactions, nowMonth, 12, settings);
  const thisMonth = series[series.length - 1].income;
  const withIncome = series.filter((m) => m.income > 0).slice(-6);
  const avg6 =
    withIncome.reduce((s, m) => s + m.income, 0) / Math.max(1, withIncome.length);
  const ytd = series
    .filter((m) => m.month.slice(0, 4) === nowMonth.slice(0, 4))
    .reduce((s, m) => s + m.income, 0);

  const trailingStart = addMonths(nowMonth, -11);
  const byCategory = incomeByCategory(state.transactions, trailingStart, nowMonth, settings);
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

  /* ---------- form handlers ---------- */

  const openAdd = () =>
    setForm({
      id: null,
      mode: "amount",
      categoryId: firstIncomeCat,
      currency: base,
      date: todayISO(),
      note: "",
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
      applyTax: tx.tax != null,
      amount: amountField,
      days: b ? String(b.days) : "",
      dailyRate: b ? String(b.dailyRate) : "",
      premium: b?.premium ? String(b.premium) : "",
      compensations: b?.compensations ? String(b.compensations) : "",
      cutoffs: b?.cutoffs ? String(b.cutoffs) : "",
    });
    setError(null);
  };

  const closeSheet = () => {
    setForm(null);
    setError(null);
  };

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

  const submit = () => {
    if (!form) return;
    if (!form.categoryId) {
      setError("Pick a category.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError("Pick a date.");
      return;
    }

    let breakdown: IncomeBreakdown | undefined;
    if (form.mode === "contract") {
      const days = parseOptional(form.days);
      const dailyRate = parseOptional(form.dailyRate);
      const premium = parseOptional(form.premium);
      const compensations = parseOptional(form.compensations);
      const cutoffs = parseOptional(form.cutoffs);
      if (!Number.isFinite(days) || days < 0 || days > 31) {
        setError("Working days must be between 0 and 31.");
        return;
      }
      if (
        [dailyRate, premium, compensations, cutoffs].some(
          (n) => !Number.isFinite(n) || n < 0,
        )
      ) {
        setError("Rate, premium, compensations and cut-offs must be non-negative.");
        return;
      }
      breakdown = { days, dailyRate, premium, compensations, cutoffs };
    }

    const grossTotal =
      form.mode === "contract" && breakdown
        ? breakdownTotal(breakdown)
        : parseAmount(form.amount);
    if (!Number.isFinite(grossTotal) || grossTotal <= 0) {
      setError("The income amount must be greater than zero.");
      return;
    }

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
    if (!Number.isFinite(netTotal) || netTotal <= 0) {
      setError("After tax the income is zero or negative — check the amount.");
      return;
    }

    const patch = {
      type: "income" as const,
      amount: netTotal,
      currency: form.currency,
      categoryId: form.categoryId,
      date: form.date,
      note: form.note.trim() || undefined,
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
    update((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <StatTile
          className="xl:col-span-4"
          label="This month"
          value={formatMoney(thisMonth, base, { compact: true })}
          tone="income"
          spark={series.map((m) => m.income)}
        />
        <StatTile
          className="xl:col-span-4"
          label="Average (6 mo)"
          value={formatMoney(avg6, base, { compact: true })}
        />
        <StatTile
          className="xl:col-span-4"
          label={`${nowMonth.slice(0, 4)} year to date`}
          value={formatMoney(ytd, base, { compact: true })}
        />

        <GlassCard title="Income by month" className="xl:col-span-7">
          {hasIncome ? (
            <MonthlyColumns
              data={series.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
              currency={base}
            />
          ) : (
            <EmptyState
              icon="📊"
              title="No income recorded yet"
              hint="Add your first income and the chart fills in."
              action={<Button onClick={openAdd}>+ Add income</Button>}
            />
          )}
        </GlassCard>

        <GlassCard title="By source (12 months)" className="xl:col-span-5">
          {catSegments.length > 0 ? (
            <CategoryBreakdown segments={catSegments} currency={base} maxSegments={7} />
          ) : (
            <EmptyState
              icon="🥧"
              title="Nothing to break down yet"
              hint="Once you log a few incomes, you’ll see where your money comes from."
            />
          )}
        </GlassCard>

        <GlassCard title="All income" className="xl:col-span-12">
          {!hasIncome ? (
            <EmptyState
              icon="💸"
              title="No income yet"
              hint="Log a salary, a freelance gig, interest, a gift, or something you sold — a simple amount is enough, or use the day-rate calculator for contract work."
              action={<Button onClick={openAdd}>+ Add income</Button>}
            />
          ) : (
            <div className="space-y-5">
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
                      <h3 className="text-[13px] font-semibold text-ink-1">
                        {formatMonth(month)}
                      </h3>
                      <span className="tnum text-[13px] font-semibold text-income">
                        {formatMoney(subtotal, base, { sign: true })}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {rows.map((tx) => {
                        const cat = catById.get(tx.categoryId);
                        return (
                          <li key={tx.id}>
                            <button
                              type="button"
                              onClick={() => openEdit(tx)}
                              className="row-tap flex w-full items-center gap-3 px-3 py-2.5 text-left"
                            >
                              <span
                                aria-hidden
                                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ghost text-lg"
                              >
                                {cat?.icon ?? "💰"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink-1">
                                  {tx.note || cat?.name || "Income"}
                                </span>
                                <span className="block truncate text-xs text-ink-3">
                                  {cat?.name ?? "Income"}
                                  {tx.breakdown
                                    ? ` · ${breakdownSummary(tx.breakdown, tx.currency)}`
                                    : ""}
                                  {tx.tax
                                    ? ` · net of ${formatMoney(tx.tax.gross - tx.amount, tx.currency)} tax`
                                    : ""}
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
      </div>

      {form && (
        <Sheet
          open
          onClose={closeSheet}
          title={form.id ? "Edit income" : "New income"}
        >
          <SegmentedControl
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

          <Field label="Currency">
            <SegmentedControl
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={form.currency}
              onChange={(currency) => setForm({ ...form, currency })}
            />
          </Field>

          {form.mode === "amount" ? (
            <Field label="Amount">
              <TextInput
                inputMode="decimal"
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
                    value={form.dailyRate}
                    onChange={(e) => setForm({ ...form, dailyRate: e.target.value })}
                    placeholder="56"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
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

          <div className="flex items-start justify-between gap-3 rounded-2xl bg-ghost px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-ink-1">Apply ФОП tax</p>
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
            <div className="rounded-2xl bg-ghost p-4">
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
              <p className="mb-1 text-[13px] font-medium text-ink-2">
                {form.applyTax ? "Net take-home" : "In every currency"}
              </p>
              <TripleMoney amount={net} currency={form.currency} settings={settings} />
            </div>
          )}

          {error && <p className="text-sm text-expense">{error}</p>}
          <Button className="w-full" onClick={submit}>
            Save
          </Button>
          {form.id && (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              Delete income
            </Button>
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
