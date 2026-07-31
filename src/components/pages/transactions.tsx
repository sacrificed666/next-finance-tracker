"use client";

import { useState } from "react";
import { CURRENCIES, ICON_CHOICES } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  dateInMonth,
  formatDate,
  formatMonth,
  monthDiff,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  expensesByCategory,
  monthTotals,
  monthlySeries,
  spentInCategory,
  subscriptionsMonthlyTotal,
} from "@/lib/finmath";
import { convert, formatMoney, formatPercent, parseAmount } from "@/lib/money";
import { deleteSchedule, remateralizeRecurring, syncSchedule, uid, useStore } from "@/lib/store";
import type {
  Budget,
  Currency,
  CategoryKind,
  RecurringRule,
  Subscription,
  SubscriptionPeriod,
  Transaction,
  TxType,
} from "@/lib/types";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  GlassCard,
  MonthInput,
  Money,
  OptionChips,
  PageHeader,
  ProgressMeter,
  SegmentedControl,
  Select,
  Sheet,
  Switch,
  TextInput,
} from "@/components/ui";
import {
  Donut,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";

const TX_TYPE_OPTIONS: Array<{ value: TxType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

/** recurring rules and budgets never deal in transfers */
const KIND_OPTIONS: Array<{ value: CategoryKind; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

interface TxForm {
  id: string | null; // null = new transaction
  type: TxType;
  amount: string;
  currency: Currency;
  categoryId: string;
  date: string;
  note: string;
  /** account the money moves through ("" = unassigned; required on transfers) */
  accountId: string;
  /** transfer destination */
  toAccountId: string;
  /** what arrived at the destination — only used on cross-currency transfers */
  toAmount: string;
}

interface RecurringForm {
  id: string | null;
  type: CategoryKind;
  amount: string;
  currency: Currency;
  categoryId: string;
  note: string;
  accountId: string;
  day: string;
  startMonth: string;
  endMonth: string; // "" = open-ended
}

interface SubscriptionForm {
  id: string | null;
  name: string;
  icon: string;
  price: string;
  currency: Currency;
  period: SubscriptionPeriod;
  accountId: string;
  day: string;
}

const PERIOD_OPTIONS: Array<{ value: SubscriptionPeriod; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** top `cap-1` categories as-is, the rest folded into one "Other" slice */
function foldSegments(all: BreakdownSegment[], cap = 6): BreakdownSegment[] {
  if (all.length <= cap) return all;
  const head = all.slice(0, cap - 1);
  const rest = all.slice(cap - 1).reduce((s, x) => s + x.value, 0);
  return [...head, { id: "__other", label: "Other", icon: "•", value: rest, colorSlot: 8 }];
}

interface BudgetForm {
  /** categoryId of the budget being edited; null = new */
  editingId: string | null;
  categoryId: string;
  limit: string;
  currency: Currency;
}

export function TransactionsPage() {
  const { state, update } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();
  const today = todayISO();

  const [month, setMonth] = useState(nowMonth);
  const [txForm, setTxForm] = useState<TxForm | null>(null);
  const [confirmTxDelete, setConfirmTxDelete] = useState(false);
  const [recForm, setRecForm] = useState<RecurringForm | null>(null);
  const [confirmRecDelete, setConfirmRecDelete] = useState(false);
  const [subForm, setSubForm] = useState<SubscriptionForm | null>(null);
  const [confirmSubDelete, setConfirmSubDelete] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetForm | null>(null);
  const [confirmBudgetDelete, setConfirmBudgetDelete] = useState(false);

  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const firstCategoryId = (kind: CategoryKind) =>
    state.categories.find((c) => c.kind === kind)?.id ?? "";

  /* ---------- selected month data ---------- */

  const canGoNext = monthDiff(nowMonth, month) < 12;
  const totals = monthTotals(state.transactions, month, settings);

  /* ---------- charts ---------- */
  const [flowMonths, setFlowMonths] = useState(6);
  const flowSeries = monthlySeries(state.transactions, month, flowMonths, settings);
  const spendEntries = [...expensesByCategory(state.transactions, month, settings).entries()];
  const spendSegments = foldSegments(
    spendEntries.map(([categoryId, value]) => {
      const cat = catById.get(categoryId);
      return {
        id: categoryId,
        label: cat?.name ?? "Uncategorized",
        icon: cat?.icon ?? "❓",
        value,
        colorSlot: cat?.colorSlot ?? 3,
      };
    }),
  );
  const hasAnyTx = state.transactions.length > 0;

  const byDay = new Map<string, Transaction[]>();
  for (const tx of state.transactions) {
    if (monthOf(tx.date) !== month) continue;
    const list = byDay.get(tx.date);
    if (list) list.push(tx);
    else byDay.set(tx.date, [tx]);
  }
  const days = [...byDay.keys()].sort().reverse();
  const monthTxCount = [...byDay.values()].reduce((n, list) => n + list.length, 0);

  const expenseCats = state.categories.filter((c) => c.kind === "expense");
  const budgetedIds = new Set(state.budgets.map((b) => b.categoryId));
  const freeBudgetCats = expenseCats.filter((c) => !budgetedIds.has(c.id));
  const budgetCatOptions = budgetForm
    ? expenseCats.filter(
        (c) => !budgetedIds.has(c.id) || c.id === budgetForm.editingId,
      )
    : [];

  /* ---------- transactions ---------- */

  const openAddTx = () =>
    setTxForm({
      id: null,
      type: "expense",
      amount: "",
      currency: base,
      categoryId: firstCategoryId("expense"),
      date: month === nowMonth ? todayISO() : dateInMonth(month, 1),
      note: "",
      accountId: state.savings[0]?.id ?? "",
      toAccountId: state.savings[1]?.id ?? "",
      toAmount: "",
    });

  const openEditTx = (tx: Transaction) =>
    setTxForm({
      id: tx.id,
      type: tx.type,
      amount: String(tx.amount),
      currency: tx.currency,
      categoryId: tx.categoryId,
      date: tx.date,
      note: tx.note ?? "",
      accountId: tx.accountId ?? "",
      toAccountId: tx.toAccountId ?? "",
      toAmount: tx.toAmount != null ? String(tx.toAmount) : "",
    });

  /** switching type keeps what still applies and fills what the new type needs */
  const switchTxType = (form: TxForm, type: TxType): TxForm =>
    type === "transfer"
      ? {
          ...form,
          type,
          categoryId: "",
          accountId: form.accountId || state.savings[0]?.id || "",
          toAccountId:
            form.toAccountId ||
            state.savings.find((a) => a.id !== (form.accountId || state.savings[0]?.id))?.id ||
            "",
        }
      : { ...form, type, categoryId: firstCategoryId(type) };

  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const fromAccount = txForm ? accountById.get(txForm.accountId) : undefined;
  const toAccount = txForm ? accountById.get(txForm.toAccountId) : undefined;
  const crossCurrency =
    txForm?.type === "transfer" &&
    fromAccount != null &&
    toAccount != null &&
    fromAccount.currency !== toAccount.currency;

  const txAmount = txForm ? parseAmount(txForm.amount) : NaN;
  const txToAmount = txForm ? parseAmount(txForm.toAmount) : NaN;

  // suggested conversion at the configured rate, shown as a hint
  const impliedRate =
    crossCurrency && fromAccount && toAccount && Number.isFinite(txAmount) && txAmount > 0
      ? formatMoney(
          convert(txAmount, fromAccount.currency, toAccount.currency, settings.rates) /
            txAmount,
          toAccount.currency,
          { exact: true },
        )
      : null;

  const txValid =
    txForm !== null &&
    Number.isFinite(txAmount) &&
    txAmount > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(txForm.date) &&
    (txForm.type === "transfer"
      ? txForm.accountId !== "" &&
        txForm.toAccountId !== "" &&
        txForm.accountId !== txForm.toAccountId &&
        (!crossCurrency || (Number.isFinite(txToAmount) && txToAmount > 0))
      : txForm.categoryId !== "");

  const saveTx = () => {
    if (!txForm || !txValid) return;
    const isTransfer = txForm.type === "transfer";
    const patch: Omit<Transaction, "id"> = isTransfer
      ? {
          type: "transfer",
          amount: txAmount,
          // a transfer is denominated in the source account's currency
          currency: fromAccount?.currency ?? txForm.currency,
          categoryId: "",
          date: txForm.date,
          note: txForm.note.trim() || undefined,
          accountId: txForm.accountId,
          toAccountId: txForm.toAccountId,
          toAmount: crossCurrency ? txToAmount : txAmount,
        }
      : {
          type: txForm.type,
          amount: txAmount,
          currency: txForm.currency,
          categoryId: txForm.categoryId,
          date: txForm.date,
          note: txForm.note.trim() || undefined,
          accountId: txForm.accountId || undefined,
        };
    update((s) => ({
      ...s,
      transactions: txForm.id
        ? s.transactions.map((t) =>
            // replace rather than merge so switching type leaves no stale
            // fields — except the link to the rule or subscription that posted
            // the row, which must survive: it is what keeps the schedule from
            // posting the same month a second time
            t.id === txForm.id
              ? {
                  id: t.id,
                  recurringId: t.recurringId,
                  subscriptionId: t.subscriptionId,
                  ...patch,
                }
              : t,
          )
        : [...s.transactions, { id: uid(), ...patch }],
    }));
    setTxForm(null);
  };

  const deleteTx = () => {
    const id = txForm?.id;
    if (!id) return;
    update((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
    setTxForm(null);
  };

  /* ---------- recurring rules ---------- */

  const openAddRec = () =>
    setRecForm({
      id: null,
      type: "expense",
      amount: "",
      currency: base,
      categoryId: firstCategoryId("expense"),
      note: "",
      accountId: state.savings[0]?.id ?? "",
      day: "1",
      startMonth: nowMonth,
      endMonth: "",
    });

  const openEditRec = (rule: RecurringRule) =>
    setRecForm({
      id: rule.id,
      type: rule.type,
      amount: String(rule.amount),
      currency: rule.currency,
      categoryId: rule.categoryId,
      note: rule.note ?? "",
      accountId: rule.accountId ?? "",
      day: String(rule.dayOfMonth),
      startMonth: rule.startMonth,
      endMonth: rule.endMonth ?? "",
    });

  const recAmount = recForm ? parseAmount(recForm.amount) : NaN;
  const recDay = recForm ? Number(recForm.day.trim()) : NaN;
  const recValid =
    recForm !== null &&
    Number.isFinite(recAmount) &&
    recAmount > 0 &&
    Number.isInteger(recDay) &&
    recDay >= 1 &&
    recDay <= 31 &&
    recForm.categoryId !== "" &&
    /^\d{4}-\d{2}$/.test(recForm.startMonth) &&
    (recForm.endMonth === "" || recForm.endMonth >= recForm.startMonth);

  const saveRec = () => {
    if (!recForm || !recValid) return;
    const patch = {
      type: recForm.type,
      amount: recAmount,
      currency: recForm.currency,
      categoryId: recForm.categoryId,
      note: recForm.note.trim() || undefined,
      accountId: recForm.accountId || undefined,
      dayOfMonth: Math.min(31, Math.max(1, recDay)),
      startMonth: recForm.startMonth,
      endMonth: recForm.endMonth || undefined,
    };
    // the new values reach every month this rule posted, past ones included —
    // the ledger has to agree with the rule that produced it
    const id = recForm.id ?? uid();
    update((s) =>
      syncSchedule(
        {
          ...s,
          recurring: recForm.id
            ? s.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r))
            : [...s.recurring, { id, ...patch }],
        },
        "recurring",
        id,
      ),
    );
    setRecForm(null);
  };

  const deleteRec = () => {
    const id = recForm?.id;
    if (!id) return;
    // the rule and every month it posted go together — nothing is left behind
    update((s) => deleteSchedule(s, "recurring", id));
    setRecForm(null);
  };

  /* ---------- subscriptions ---------- */

  const subsTotal = subscriptionsMonthlyTotal(state.subscriptions, base, settings);
  const sortedSubs = [...state.subscriptions].sort((a, b) =>
    a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1,
  );

  const openAddSub = () =>
    setSubForm({
      id: null,
      name: "",
      icon: "📱",
      price: "",
      currency: "UAH",
      period: "monthly",
      accountId: state.savings[0]?.id ?? "",
      day: "1",
    });

  const openEditSub = (sub: Subscription) =>
    setSubForm({
      id: sub.id,
      name: sub.name,
      icon: sub.icon,
      price: String(sub.price),
      currency: sub.currency,
      period: sub.period,
      accountId: sub.accountId ?? "",
      day: String(sub.dayOfMonth),
    });

  const subPrice = subForm ? parseAmount(subForm.price) : NaN;
  const subDay = subForm ? Number(subForm.day.trim()) : NaN;
  const subValid =
    subForm !== null &&
    subForm.name.trim() !== "" &&
    Number.isFinite(subPrice) &&
    subPrice > 0 &&
    Number.isInteger(subDay) &&
    subDay >= 1 &&
    subDay <= 31;

  const saveSub = () => {
    if (!subForm || !subValid) return;
    const patch = {
      name: subForm.name.trim(),
      icon: subForm.icon,
      price: subPrice,
      currency: subForm.currency,
      period: subForm.period,
      accountId: subForm.accountId || undefined,
      dayOfMonth: Math.min(31, Math.max(1, subDay)),
    };
    // a new price or billing day rewrites every charge this subscription has
    // posted, not just the planned ones
    const id = subForm.id ?? uid();
    update((s) =>
      syncSchedule(
        {
          ...s,
          subscriptions: subForm.id
            ? s.subscriptions.map((sub) => (sub.id === id ? { ...sub, ...patch } : sub))
            : [...s.subscriptions, { id, ...patch, startMonth: nowMonth, active: true }],
        },
        "subscription",
        id,
      ),
    );
    setSubForm(null);
  };

  const toggleSub = (id: string, active: boolean) => {
    update((s) =>
      remateralizeRecurring({
        ...s,
        subscriptions: s.subscriptions.map((sub) =>
          sub.id === id ? { ...sub, active } : sub,
        ),
      }),
    );
  };

  const deleteSub = () => {
    const id = subForm?.id;
    if (!id) return;
    // the subscription and every charge it posted go together — to keep the
    // charges so far, switch it off instead of deleting it
    update((s) => deleteSchedule(s, "subscription", id));
    setSubForm(null);
  };

  /* ---------- budgets ---------- */

  const openAddBudget = () => {
    const first = freeBudgetCats[0];
    if (!first) return;
    setBudgetForm({
      editingId: null,
      categoryId: first.id,
      limit: "",
      currency: base,
    });
  };

  const openEditBudget = (b: Budget) =>
    setBudgetForm({
      editingId: b.categoryId,
      categoryId: b.categoryId,
      limit: String(b.limit),
      currency: b.currency,
    });

  const budgetLimit = budgetForm ? parseAmount(budgetForm.limit) : NaN;
  const budgetValid =
    budgetForm !== null &&
    Number.isFinite(budgetLimit) &&
    budgetLimit > 0 &&
    budgetForm.categoryId !== "";

  const saveBudget = () => {
    if (!budgetForm || !budgetValid) return;
    const entry: Budget = {
      categoryId: budgetForm.categoryId,
      limit: budgetLimit,
      currency: budgetForm.currency,
    };
    update((s) => ({
      ...s,
      budgets: [
        ...s.budgets.filter(
          (b) =>
            b.categoryId !== budgetForm.editingId &&
            b.categoryId !== budgetForm.categoryId,
        ),
        entry,
      ],
    }));
    setBudgetForm(null);
  };

  const deleteBudget = () => {
    const id = budgetForm?.editingId;
    if (!id) return;
    update((s) => ({
      ...s,
      budgets: s.budgets.filter((b) => b.categoryId !== id),
    }));
    setBudgetForm(null);
  };

  /* ---------- render ---------- */

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Ledger, recurring payments, subscriptions and budgets"
        action={<Button onClick={openAddTx}>+ Add</Button>}
      />
      <div className="stagger space-y-5">
        {/* month switcher */}
        <div className="glass flex items-center gap-3 rounded-card px-4 py-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
            className="icon-btn size-10 shrink-0 border border-hairline bg-ghost text-ink-2 shadow-[inset_0_1px_0_var(--card-highlight)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
          {/* the strip used to be a wide empty bar with a month name in it —
              it now carries where you are and how the month closed */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-1">
              <span className="truncate">{formatMonth(month)}</span>
              {month === nowMonth && (
                <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent sm:inline">
                  this month
                </span>
              )}
            </span>
            <span className="tnum text-xs text-ink-3">
              {monthTxCount} entr{monthTxCount === 1 ? "y" : "ies"} ·{" "}
              <span className={totals.net >= 0 ? "text-income" : "text-expense"}>
                {formatMoney(totals.net, base, { compact: true, sign: true })}
              </span>
            </span>
          </div>
          {month !== nowMonth && (
            <Button
              variant="ghost"
              className="shrink-0 px-3 text-xs"
              onClick={() => setMonth(nowMonth)}
            >
              Today
            </Button>
          )}
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={!canGoNext}
            className="icon-btn size-10 shrink-0 border border-hairline bg-ghost text-ink-2 shadow-[inset_0_1px_0_var(--card-highlight)] disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
        </div>

        {/* month summary */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <StatTile
            label="Income"
            value={formatMoney(totals.income, base, { compact: true })}
            tone="income"
            spark={flowSeries.map((m) => m.income)}
          />
          <StatTile
            label="Expenses"
            value={formatMoney(totals.expense, base, { compact: true })}
            tone="expense"
            spark={flowSeries.map((m) => m.expense)}
            hint={
              totals.income > 0
                ? `${formatPercent((totals.expense / totals.income) * 100, 0)} of what came in`
                : undefined
            }
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            label="Net"
            value={formatMoney(totals.net, base, { sign: true, compact: true })}
            tone={totals.net < 0 ? "expense" : "income"}
            spark={flowSeries.map((m) => m.income - m.expense)}
            hint={`${formatMoney(totals.expense / new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(), base, { compact: true })} spent per day on average`}
          />
        </div>

        {/* charts */}
        {hasAnyTx && (
          <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-2">
            <GlassCard title="Where it went" subtitle={formatMonth(month)} icon="🍩" className="flex flex-col">
              {spendSegments.length > 0 ? (
                <div className="flex flex-1 flex-col justify-center">
                  <Donut segments={spendSegments} currency={base} centerLabel="Spent" size={220} />
                </div>
              ) : (
                <EmptyState
                  icon="🧾"
                  title="No spending this month"
                  hint="Expenses you log this month break down here by category."
                />
              )}
            </GlassCard>
            <GlassCard
              title="Cash flow"
              subtitle="Income vs expenses"
              icon="📊"
              action={<PeriodTabs value={flowMonths} onChange={setFlowMonths} />}
            >
              <MonthlyColumns
                data={flowSeries.map((m) => ({
                  month: m.month,
                  income: m.income,
                  expense: m.expense,
                }))}
                currency={base}
                height={220}
              />
            </GlassCard>
          </div>
        )}

        <div className="grid items-start gap-3 sm:gap-4 xl:grid-cols-5">
        {/* transaction list */}
        <div className="space-y-4 xl:col-span-3">
        {days.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="🧾"
              title="No transactions this month"
              hint="Add the first record and the history shows up here."
              action={<Button onClick={openAddTx}>+ Add</Button>}
            />
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {days.map((day) => {
              const planned = day > today;
              return (
              <section key={day}>
                <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-medium text-ink-3">
                  {formatDate(day)}
                  {planned && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Planned
                    </span>
                  )}
                </h3>
                <div
                  className={`glass space-y-0.5 rounded-card p-1.5 ${
                    planned ? "opacity-70" : ""
                  }`}
                >
                  {byDay.get(day)!.map((tx) => {
                    const cat = catById.get(tx.categoryId);
                    const isTransfer = tx.type === "transfer";
                    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
                    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => openEditTx(tx)}
                        className="row-tap flex w-full items-center gap-3 px-3 py-2.5 text-left"
                      >
                        <span
                          aria-hidden
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ghost text-lg"
                        >
                          {isTransfer ? "⇄" : (cat?.icon ?? "❓")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-1">
                            {isTransfer
                              ? `${from?.name ?? "?"} → ${to?.name ?? "?"}`
                              : (cat?.name ?? "Uncategorized")}
                          </span>
                          <span className="block truncate text-xs text-ink-3">
                            {isTransfer
                              ? tx.toAmount != null && to && tx.toAmount !== tx.amount
                                ? `arrives as ${formatMoney(tx.toAmount, to.currency, { exact: true })}`
                                : (tx.note ?? "Transfer")
                              : [tx.note, from?.name].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <Money
                          amount={tx.type === "expense" ? -tx.amount : tx.amount}
                          currency={tx.currency}
                          sign={!isTransfer}
                          className={`shrink-0 text-sm font-semibold ${
                            isTransfer
                              ? "text-ink-2"
                              : tx.type === "income"
                                ? "text-income"
                                : "text-expense"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        )}
        </div>

        <div className="space-y-4 xl:col-span-2">
        {/* subscriptions */}
        <GlassCard
          title="Subscriptions"
          subtitle="Recurring services"
          icon="📱"
          action={
            <Button variant="ghost" onClick={openAddSub}>
              + Add
            </Button>
          }
        >
          {state.subscriptions.length === 0 ? (
            <EmptyState
              icon="📱"
              title="No subscriptions yet"
              hint="Add them once — each active subscription posts itself on its cycle (monthly or yearly), and yearly costs are split evenly across the months."
              action={
                <Button variant="ghost" onClick={openAddSub}>
                  + Add
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-2">
                Active total:{" "}
                <span className="tnum font-semibold text-ink-1">
                  {formatMoney(subsTotal, base, { exact: true })}/mo
                </span>
              </p>
              <ul className="space-y-0.5">
                {sortedSubs.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2 pr-1">
                    <button
                      type="button"
                      onClick={() => openEditSub(sub)}
                      className={`row-tap flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left ${
                        sub.active ? "" : "opacity-50"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base"
                      >
                        {sub.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-1">
                          {sub.name}
                        </span>
                        <span className="block text-xs text-ink-3">
                          {sub.period === "yearly"
                            ? `${formatMoney(sub.price, sub.currency)}/yr · split into 12`
                            : `day ${sub.dayOfMonth} of each month`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Money
                          amount={
                            sub.period === "yearly" ? sub.price / 12 : sub.price
                          }
                          currency={sub.currency}
                          exact
                          className="block text-sm font-semibold text-ink-1"
                        />
                        <span className="block text-xs text-ink-3">/mo</span>
                      </span>
                    </button>
                    <Switch
                      checked={sub.active}
                      onChange={(v) => toggleSub(sub.id, v)}
                      label={`${sub.name} active`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </GlassCard>

        {/* recurring */}
        <GlassCard
          title="Recurring"
          subtitle="Auto-posted each month"
          icon="🔁"
          action={
            <Button variant="ghost" onClick={openAddRec}>
              + Add
            </Button>
          }
        >
          {state.recurring.length === 0 ? (
            <EmptyState
              icon="🔁"
              title="No recurring payments"
              hint="Salary or rent — add them once and they post themselves every month."
              action={
                <Button variant="ghost" onClick={openAddRec}>
                  + Add
                </Button>
              }
            />
          ) : (
            <ul className="space-y-0.5">
              {state.recurring.map((rule) => {
                const cat = catById.get(rule.categoryId);
                return (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => openEditRec(rule)}
                      className="row-tap flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ghost text-lg"
                      >
                        {cat?.icon ?? "❓"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-1">
                          {cat?.name ?? "Uncategorized"}
                          {rule.note && (
                            <span className="font-normal text-ink-3"> · {rule.note}</span>
                          )}
                        </span>
                        <span className="tnum block text-xs text-ink-2">
                          {formatMoney(rule.amount, rule.currency)} · monthly on day{" "}
                          {rule.dayOfMonth}
                        </span>
                        <span className="block text-xs text-ink-3">
                          from {formatMonth(rule.startMonth)}
                          {rule.endMonth ? ` to ${formatMonth(rule.endMonth)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

        {/* budgets */}
        <GlassCard
          title="Monthly budgets"
          subtitle="Per-category limits"
          icon="🎯"
          action={
            <Button
              variant="ghost"
              onClick={openAddBudget}
              disabled={freeBudgetCats.length === 0}
            >
              + Add
            </Button>
          }
        >
          {state.budgets.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="No budgets"
              hint="Set monthly spending limits per category — you’ll see right away when you approach the line."
              action={
                <Button variant="ghost" onClick={openAddBudget}>
                  + Add
                </Button>
              }
            />
          ) : (
            <ul className="space-y-1">
              {state.budgets.map((b) => {
                const cat = catById.get(b.categoryId);
                const spent = spentInCategory(
                  state.transactions,
                  b.categoryId,
                  month,
                  b.currency,
                  settings,
                );
                const over = spent > b.limit;
                const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
                return (
                  <li key={b.categoryId}>
                    <button
                      type="button"
                      onClick={() => openEditBudget(b)}
                      className="row-tap block w-full px-3 py-2.5 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden className="text-lg leading-none">
                          {cat?.icon ?? "❓"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">
                          {cat?.name ?? "Uncategorized"}
                        </span>
                        <span
                          className={`tnum text-xs font-medium ${
                            over ? "text-expense" : "text-ink-3"
                          }`}
                        >
                          {formatPercent(pct, 0)}
                        </span>
                      </span>
                      <span className="mt-2 block">
                        <ProgressMeter value={spent} max={b.limit} tone="budget" />
                      </span>
                      <span
                        className={`tnum mt-1.5 block text-xs ${
                          over ? "text-expense" : "text-ink-3"
                        }`}
                      >
                        {formatMoney(spent, b.currency)} of {formatMoney(b.limit, b.currency)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
        </div>
        </div>
      </div>

      {/* transaction sheet */}
      {txForm && (
        <Sheet
          open
          onClose={() => setTxForm(null)}
          title={txForm.id ? "Edit transaction" : "New transaction"}
        >
          <SegmentedControl
            options={TX_TYPE_OPTIONS}
            value={txForm.type}
            onChange={(t) => setTxForm(switchTxType(txForm, t))}
          />

          {txForm.type === "transfer" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From account">
                  <Select
                    value={txForm.accountId}
                    onChange={(e) =>
                      setTxForm({
                        ...txForm,
                        accountId: e.target.value,
                        currency: accountById.get(e.target.value)?.currency ?? txForm.currency,
                      })
                    }
                  >
                    {state.savings.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.icon} {a.name} ({a.currency})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To account">
                  <Select
                    value={txForm.toAccountId}
                    onChange={(e) => setTxForm({ ...txForm, toAccountId: e.target.value })}
                  >
                    {state.savings
                      .filter((a) => a.id !== txForm.accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.icon} {a.name} ({a.currency})
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
              <Field
                label={`Amount sent${fromAccount ? ` (${fromAccount.currency})` : ""}`}
              >
                <TextInput
                  inputMode="decimal"
                  placeholder="0"
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                />
              </Field>
              {crossCurrency && (
                <Field
                  label={`Amount received (${toAccount?.currency})`}
                  hint={
                    impliedRate
                      ? `rate ${impliedRate} — leave as suggested or type what actually arrived`
                      : undefined
                  }
                >
                  <TextInput
                    inputMode="decimal"
                    placeholder="0"
                    value={txForm.toAmount}
                    onChange={(e) => setTxForm({ ...txForm, toAmount: e.target.value })}
                  />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Amount">
                <TextInput
                  inputMode="decimal"
                  placeholder="0"
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <SegmentedControl
                  options={CURRENCY_OPTIONS}
                  value={txForm.currency}
                  onChange={(c) => setTxForm({ ...txForm, currency: c })}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={txForm.categoryId}
                  onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })}
                >
                  {state.categories
                    .filter((c) => c.kind === txForm.type)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field
                label="Account"
                hint={
                  state.savings.length === 0
                    ? "Add an account on Balance to have this move a real balance"
                    : "Which account the money moves through"
                }
              >
                <Select
                  value={txForm.accountId}
                  onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}
                >
                  <option value="">— not assigned —</option>
                  {state.savings.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name} ({a.currency})
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <Field label="Date">
            <TextInput
              type="date"
              value={txForm.date}
              onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
            />
          </Field>
          <Field label="Note">
            <TextInput
              placeholder="Optional"
              value={txForm.note}
              onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
            />
          </Field>
          <Button className="w-full" onClick={saveTx} disabled={!txValid}>
            Save
          </Button>
          {txForm.id && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmTxDelete(true)}
            >
              Delete
            </Button>
          )}
        </Sheet>
      )}

      {/* recurring sheet */}
      {recForm && (
        <Sheet
          open
          onClose={() => setRecForm(null)}
          title={recForm.id ? "Edit recurring rule" : "New recurring rule"}
        >
          {recForm.id && (
            <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">
              Saving rewrites every month this rule posted, the ones already recorded
              included — so the ledger keeps matching the rule.
            </p>
          )}
          <SegmentedControl
            options={KIND_OPTIONS}
            value={recForm.type}
            onChange={(t) =>
              setRecForm({ ...recForm, type: t, categoryId: firstCategoryId(t) })
            }
          />
          <Field label="Amount">
            <TextInput
              inputMode="decimal"
              placeholder="0"
              value={recForm.amount}
              onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <SegmentedControl
              options={CURRENCY_OPTIONS}
              value={recForm.currency}
              onChange={(c) => setRecForm({ ...recForm, currency: c })}
            />
          </Field>
          <Field label="Category">
            <Select
              value={recForm.categoryId}
              onChange={(e) => setRecForm({ ...recForm, categoryId: e.target.value })}
            >
              {state.categories
                .filter((c) => c.kind === recForm.type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Note">
            <TextInput
              placeholder="Optional"
              value={recForm.note}
              onChange={(e) => setRecForm({ ...recForm, note: e.target.value })}
            />
          </Field>
          <Field label="Account" hint="Charges move this account's balance">
            <Select
              value={recForm.accountId}
              onChange={(e) => setRecForm({ ...recForm, accountId: e.target.value })}
            >
              <option value="">— not assigned —</option>
              {state.savings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Day of month" hint="1–28 keeps it valid in every month">
            <TextInput
              inputMode="numeric"
              value={recForm.day}
              onChange={(e) => setRecForm({ ...recForm, day: e.target.value })}
            />
          </Field>
          <Field label="From">
            <MonthInput
              name="From"
              value={recForm.startMonth}
              onChange={(startMonth) => setRecForm({ ...recForm, startMonth })}
            />
          </Field>
          <Field label="Until (optional)" hint="Leave empty to keep it running">
            <MonthInput
              name="Until"
              allowEmpty
              value={recForm.endMonth}
              onChange={(endMonth) => setRecForm({ ...recForm, endMonth })}
            />
          </Field>
          <Button className="w-full" onClick={saveRec} disabled={!recValid}>
            Save
          </Button>
          {recForm.id && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmRecDelete(true)}
            >
              Delete
            </Button>
          )}
        </Sheet>
      )}

      {/* subscription sheet */}
      {subForm && (
        <Sheet
          open
          onClose={() => setSubForm(null)}
          title={subForm.id ? "Edit subscription" : "New subscription"}
        >
          {subForm.id && (
            <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">
              Saving rewrites every charge this subscription posted, past months
              included. To stop it without touching them, switch it off instead.
            </p>
          )}
          <Field label="Name">
            <TextInput
              value={subForm.name}
              onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
              placeholder="YouTube Premium"
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Icon</span>
            <OptionChips
                label="Icon"
                size="lg"
                options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
                value={subForm.icon}
                onChange={(icon) => setSubForm({ ...subForm, icon })}
              />
          </div>
          <Field label="Billing period">
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={subForm.period}
              onChange={(p) => setSubForm({ ...subForm, period: p })}
            />
          </Field>
          <Field
            label={subForm.period === "yearly" ? "Price per year" : "Price per month"}
            hint={
              subForm.period === "yearly" && Number.isFinite(subPrice) && subPrice > 0
                ? `posted as ${formatMoney(subPrice / 12, subForm.currency, { exact: true })}/mo × 12`
                : undefined
            }
          >
            <TextInput
              inputMode="decimal"
              value={subForm.price}
              onChange={(e) => setSubForm({ ...subForm, price: e.target.value })}
              placeholder={subForm.period === "yearly" ? "1188" : "99"}
            />
          </Field>
          <Field label="Currency">
            <SegmentedControl
              options={CURRENCY_OPTIONS}
              value={subForm.currency}
              onChange={(c) => setSubForm({ ...subForm, currency: c })}
            />
          </Field>
          <Field label="Account" hint="Charges move this account's balance">
            <Select
              value={subForm.accountId}
              onChange={(e) => setSubForm({ ...subForm, accountId: e.target.value })}
            >
              <option value="">— not assigned —</option>
              {state.savings.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Charge day" hint="1–28 keeps it valid in every month">
            <TextInput
              inputMode="numeric"
              value={subForm.day}
              onChange={(e) => setSubForm({ ...subForm, day: e.target.value })}
            />
          </Field>
          <Button className="w-full" onClick={saveSub} disabled={!subValid}>
            Save
          </Button>
          {subForm.id && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmSubDelete(true)}
            >
              Delete
            </Button>
          )}
        </Sheet>
      )}

      {/* budget sheet */}
      {budgetForm && (
        <Sheet
          open
          onClose={() => setBudgetForm(null)}
          title={budgetForm.editingId ? "Edit budget" : "New budget"}
        >
          <Field label="Expense category">
            <Select
              value={budgetForm.categoryId}
              onChange={(e) =>
                setBudgetForm({ ...budgetForm, categoryId: e.target.value })
              }
            >
              {budgetCatOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monthly limit">
            <TextInput
              inputMode="decimal"
              placeholder="0"
              value={budgetForm.limit}
              onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <SegmentedControl
              options={CURRENCY_OPTIONS}
              value={budgetForm.currency}
              onChange={(c) => setBudgetForm({ ...budgetForm, currency: c })}
            />
          </Field>
          <Button className="w-full" onClick={saveBudget} disabled={!budgetValid}>
            Save
          </Button>
          {budgetForm.editingId && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirmBudgetDelete(true)}
            >
              Delete
            </Button>
          )}
        </Sheet>
      )}

      {/* delete confirms */}
      <ConfirmDialog
        open={confirmTxDelete}
        onClose={() => setConfirmTxDelete(false)}
        onConfirm={deleteTx}
        title="Delete this transaction?"
        message="The record will be removed permanently. This cannot be undone."
      />
      <ConfirmDialog
        open={confirmRecDelete}
        onClose={() => setConfirmRecDelete(false)}
        onConfirm={deleteRec}
        title="Delete this rule?"
        message="The rule and every transaction it posted are removed, in past and future months alike. This cannot be undone."
      />
      <ConfirmDialog
        open={confirmSubDelete}
        onClose={() => setConfirmSubDelete(false)}
        onConfirm={deleteSub}
        title="Delete this subscription?"
        message="The subscription and every charge it posted are removed, in past and future months alike. To keep those charges, switch it off instead."
      />
      <ConfirmDialog
        open={confirmBudgetDelete}
        onClose={() => setConfirmBudgetDelete(false)}
        onConfirm={deleteBudget}
        title="Delete this budget?"
        message="The limit for this category will be removed. Transactions are not affected."
      />
    </>
  );
}
