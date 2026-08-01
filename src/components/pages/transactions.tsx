"use client";

import { useState } from "react";
import { CURRENCIES, CURRENCY_SYMBOL, ICON_CHOICES } from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  dateInMonth,
  daysInMonth,
  formatDate,
  formatDateShort,
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
import {
  deleteSchedule,
  PLANNING_HORIZON_MONTHS,
  remateralizeRecurring,
  syncSchedule,
  uid,
  useStore,
} from "@/lib/store";
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
  FieldSet,
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
  CategoryBreakdown,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import { Icon } from "@/components/icons";

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
  /** the month charges start posting from — a service you signed up to in
   *  March should show its March charge, not start the month you typed it in */
  startMonth: string;
}

const PERIOD_OPTIONS: Array<{ value: SubscriptionPeriod; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

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
  /* ledger search: a query, a type filter, and whether to look past this month */
  const [query, setQuery] = useState("");
  const [ledgerType, setLedgerType] = useState<TxType | "all">("all");
  const [searchAll, setSearchAll] = useState(false);
  const [txForm, setTxForm] = useState<TxForm | null>(null);
  const [confirmTxDelete, setConfirmTxDelete] = useState(false);
  const [recForm, setRecForm] = useState<RecurringForm | null>(null);
  const [confirmRecDelete, setConfirmRecDelete] = useState(false);
  const [subForm, setSubForm] = useState<SubscriptionForm | null>(null);
  const [confirmSubDelete, setConfirmSubDelete] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetForm | null>(null);
  const [confirmBudgetDelete, setConfirmBudgetDelete] = useState(false);

  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const firstCategoryId = (kind: CategoryKind) =>
    state.categories.find((c) => c.kind === kind)?.id ?? "";

  /* ---------- selected month data ---------- */

  // as far ahead as the schedules actually post: the horizon covers the current
  // month plus the next eleven, so month + 12 was always a guaranteed blank page
  const canGoNext = monthDiff(nowMonth, month) < PLANNING_HORIZON_MONTHS - 1;
  const totals = monthTotals(state.transactions, month, settings);
  // the month before, so each tile can say which way things moved rather than
  // printing a figure with nothing to measure it against
  const prevTotals = monthTotals(state.transactions, addMonths(month, -1), settings);
  const hasPrev = prevTotals.income > 0 || prevTotals.expense > 0;
  const vsLast = (now: number, before: number, lowerIsBetter = false) =>
    hasPrev
      ? {
          text: `${formatMoney(now - before, base, { compact: true, sign: true })} vs last month`,
          good: lowerIsBetter ? now <= before : now >= before,
        }
      : undefined;
  // rules and subscriptions post ahead, so part of an open month has not
  // happened yet — the same split the dashboard tiles carry
  const plannedIn = (type: "income" | "expense") =>
    state.transactions
      .filter((t) => t.type === type && monthOf(t.date) === month && t.date > today)
      .reduce((sum, t) => sum + convert(t.amount, t.currency, base, settings.rates), 0);
  const stillAhead = (total: number, ahead: number) =>
    ahead > 0
      ? `${formatMoney(total - ahead, base, { compact: true })} so far · ${formatMoney(ahead, base, { compact: true })} planned`
      : undefined;

  /* ---------- charts ---------- */
  const [flowMonths, setFlowMonths] = useState(6);
  const flowSeries = monthlySeries(state.transactions, month, flowMonths, settings);
  // no local folding: CategoryBreakdown already rolls the tail into one "Other"
  // row, and doing it twice meant a second, differently-labelled cut-off
  const spendSegments: BreakdownSegment[] = [
    ...expensesByCategory(state.transactions, month, settings).entries(),
  ].map(([categoryId, value]) => {
    const cat = catById.get(categoryId);
    return {
      id: categoryId,
      label: cat?.name ?? "Uncategorized",
      icon: cat?.icon ?? "❓",
      value,
      colorSlot: cat?.colorSlot ?? 3,
    };
  });
  const hasAnyTx = state.transactions.length > 0;

  /* ---------- ledger scope ---------- */

  /**
   * A ledger you can only page through a month at a time answers "what did
   * March cost" and nothing else — "where did that 4 000 go" needs a search.
   * The query reads every field a row shows: note, category, either account,
   * and the amount as typed.
   */
  const q = query.trim().toLowerCase();
  const filtering = q !== "" || ledgerType !== "all";
  const matchesFilter = (tx: Transaction) => {
    if (ledgerType !== "all" && tx.type !== ledgerType) return false;
    if (!q) return true;
    const cat = catById.get(tx.categoryId);
    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    return [tx.note, cat?.name, from?.name, to?.name, String(tx.amount), tx.currency].some(
      (field) => field?.toLowerCase().includes(q),
    );
  };

  const monthTx = state.transactions.filter((t) => monthOf(t.date) === month);
  const monthTxCount = monthTx.length;
  // searching the whole ledger is opt-in, so paging months stays the default
  // reading and a query never silently drags rows in from other years
  const spanningAll = searchAll && filtering;
  const ledgerTx = (spanningAll ? state.transactions : monthTx).filter(matchesFilter);
  const elsewhereCount =
    filtering && !spanningAll
      ? state.transactions.filter((t) => monthOf(t.date) !== month && matchesFilter(t)).length
      : 0;

  const byDay = new Map<string, Transaction[]>();
  for (const tx of ledgerTx) {
    const list = byDay.get(tx.date);
    if (list) list.push(tx);
    else byDay.set(tx.date, [tx]);
  }
  const days = [...byDay.keys()].sort().reverse();

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

  // a transfer needs two places to move money between; with fewer the tab could
  // be picked but never saved, and the Save button gave no reason why
  const canTransfer = state.savings.length >= 2;
  const txTypeOptions = canTransfer
    ? TX_TYPE_OPTIONS
    : TX_TYPE_OPTIONS.filter((o) => o.value !== "transfer");

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

  /**
   * Why Save is off. A disabled button with nothing beside it is a dead end:
   * on a form with an amount, two accounts and a cross-currency second amount,
   * "it just won't save" is not something you can debug by looking at it.
   */
  const txProblem: string | null =
    txForm === null || txValid
      ? null
      : !Number.isFinite(txAmount) || txAmount <= 0
        ? "Enter an amount greater than zero."
        : !/^\d{4}-\d{2}-\d{2}$/.test(txForm.date)
          ? "Pick a date."
          : txForm.type !== "transfer"
            ? "Pick a category."
            : txForm.accountId === "" || txForm.toAccountId === ""
              ? "Pick the account the money leaves and the one it lands in."
              : txForm.accountId === txForm.toAccountId
                ? "A transfer needs two different accounts."
                : `Enter what actually arrived in ${toAccount?.name ?? "the destination"}.`;

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
    update(
      (s) => ({
        ...s,
        transactions: s.transactions.filter((t) => t.id !== id),
      }),
      "Transaction deleted",
    );
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

  const recProblem: string | null =
    recForm === null || recValid
      ? null
      : !Number.isFinite(recAmount) || recAmount <= 0
        ? "Enter an amount greater than zero."
        : !Number.isInteger(recDay) || recDay < 1 || recDay > 31
          ? "The day of the month has to be a whole number between 1 and 31."
          : recForm.categoryId === ""
            ? "Pick a category."
            : "The end month cannot come before the start month.";

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
    update((s) => deleteSchedule(s, "recurring", id), "Recurring rule deleted");
    setRecForm(null);
  };

  /** how many ledger rows a schedule's delete would take with it */
  const postedCount = (kind: "recurring" | "subscription", id: string | null) =>
    id === null
      ? 0
      : state.transactions.filter((t) =>
          kind === "recurring" ? t.recurringId === id : t.subscriptionId === id,
        ).length;

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
      startMonth: nowMonth,
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
      startMonth: sub.startMonth,
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
    subDay <= 31 &&
    /^\d{4}-\d{2}$/.test(subForm.startMonth);

  const subProblem: string | null =
    subForm === null || subValid
      ? null
      : subForm.name.trim() === ""
        ? "Name the service."
        : !Number.isFinite(subPrice) || subPrice <= 0
          ? "Enter a price greater than zero."
          : "The charge day has to be a whole number between 1 and 31.";

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
      startMonth: subForm.startMonth,
    };
    // a new price, billing day or start month rewrites every charge this
    // subscription has posted, not just the planned ones
    const id = subForm.id ?? uid();
    update((s) =>
      syncSchedule(
        {
          ...s,
          subscriptions: subForm.id
            ? s.subscriptions.map((sub) => (sub.id === id ? { ...sub, ...patch } : sub))
            : [...s.subscriptions, { id, ...patch, active: true }],
        },
        "subscription",
        id,
      ),
    );
    setSubForm(null);
  };

  const toggleSub = (id: string, active: boolean) => {
    update(
      (s) =>
        remateralizeRecurring({
          ...s,
          subscriptions: s.subscriptions.map((sub) =>
            sub.id === id ? { ...sub, active } : sub,
          ),
        }),
      active ? "Subscription switched on" : "Subscription switched off",
    );
  };

  const deleteSub = () => {
    const id = subForm?.id;
    if (!id) return;
    // the subscription and every charge it posted go together — to keep the
    // charges so far, switch it off instead of deleting it
    update((s) => deleteSchedule(s, "subscription", id), "Subscription deleted");
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

  const budgetProblem: string | null =
    budgetForm === null || budgetValid
      ? null
      : budgetForm.categoryId === ""
        ? "Pick a category."
        : "Enter a monthly limit greater than zero.";

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
    update(
      (s) => ({
        ...s,
        budgets: s.budgets.filter((b) => b.categoryId !== id),
      }),
      "Budget deleted",
    );
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
      <div className="stagger space-y-4 sm:space-y-5">
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
            <span className="body-strong flex items-center gap-2 font-semibold">
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
              size="sm"
              className="shrink-0"
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
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
          <StatTile
            label="Income"
            href="/income"
            value={formatMoney(totals.income, base, { compact: true })}
            tone="income"
            spark={flowSeries.map((m) => m.income)}
            delta={vsLast(totals.income, prevTotals.income)}
            hint={stillAhead(totals.income, plannedIn("income"))}
          />
          <StatTile
            label="Expenses"
            value={formatMoney(totals.expense, base, { compact: true })}
            tone="expense"
            spark={flowSeries.map((m) => m.expense)}
            delta={vsLast(totals.expense, prevTotals.expense, true)}
            hint={
              stillAhead(totals.expense, plannedIn("expense")) ??
              (totals.income > 0
                ? `${formatPercent((totals.expense / totals.income) * 100, 0)} of what came in`
                : undefined)
            }
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            label="Net"
            value={formatMoney(totals.net, base, { sign: true, compact: true })}
            tone={totals.net < 0 ? "expense" : "income"}
            spark={flowSeries.map((m) => m.income - m.expense)}
            delta={vsLast(totals.net, prevTotals.net)}
            hint={`${formatMoney(totals.expense / daysInMonth(month), base, { compact: true })} spent per day on average`}
          />
        </div>

        {/* charts */}
        {hasAnyTx && (
          <div className="grid items-stretch gap-4 sm:gap-5 lg:grid-cols-2">
            <GlassCard
              title="Where it went"
              subtitle={formatMonth(month)}
              icon={<Icon name="pie" />}
              className="flex flex-col"
            >
              {spendSegments.length > 0 ? (
                // The same breakdown the dashboard draws, rather than a donut of
                // the same numbers: one question — where did the month go — had
                // two different visual answers on two pages. The list wins on
                // merit, not just consistency; it labels every slice, prints the
                // amount beside it, and does not collapse to "C 69%" when the
                // column gets narrow. The ring is kept for currency allocation,
                // where three slices really are a part of one whole.
                <div className="flex flex-1 flex-col justify-center">
                  <div className="mb-3.5 flex items-end justify-between gap-3">
                    <p className="num-md whitespace-nowrap text-ink-1">
                      {formatMoney(totals.expense, base, { compact: true })}
                    </p>
                    <p className="caption">
                      {spendSegments.length} categor
                      {spendSegments.length === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <CategoryBreakdown segments={spendSegments} currency={base} />
                </div>
              ) : (
                <EmptyState
                  icon={<Icon name="receipt" />}
                  title="No spending this month"
                  hint="Expenses you log this month break down here by category."
                />
              )}
            </GlassCard>
            <GlassCard
              title="Cash flow"
              subtitle="Income vs expenses"
              icon={<Icon name="chart" />}
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

        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-5">
        {/* transaction list */}
        <div className="space-y-4 sm:space-y-5 xl:col-span-3">
        {hasAnyTx && (
          // a month-at-a-time ledger can only answer "what did March cost";
          // finding one payment needs a query, so the two sit side by side
          <div className="glass flex flex-wrap items-center gap-2 rounded-card px-3 py-2.5">
            <div className="relative min-w-40 flex-1">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
              </span>
              <TextInput
                type="search"
                size="sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes, categories, accounts…"
                aria-label="Search transactions"
                className="pl-9.5"
              />
            </div>
            <SegmentedControl
              size="sm"
              label="Kind of entry"
              className="shrink-0"
              options={[
                { value: "all" as const, label: "All" },
                { value: "expense" as const, label: "Out" },
                { value: "income" as const, label: "In" },
                { value: "transfer" as const, label: "⇄" },
              ]}
              value={ledgerType}
              onChange={setLedgerType}
            />
            {filtering && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setQuery("");
                  setLedgerType("all");
                  setSearchAll(false);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        )}
        {days.length === 0 ? (
          <GlassCard>
            {filtering ? (
              <EmptyState
                icon={<Icon name="search" />}
                title="Nothing matches"
                hint={
                  elsewhereCount > 0
                    ? `No match in ${formatMonth(month)}, but ${elsewhereCount} elsewhere.`
                    : "Try a different word, or clear the filter."
                }
                action={
                  elsewhereCount > 0 ? (
                    <Button variant="ghost" onClick={() => setSearchAll(true)}>
                      Search every month
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setQuery("");
                        setLedgerType("all");
                      }}
                    >
                      Clear filter
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={<Icon name="receipt" />}
                title="No transactions this month"
                hint="Add the first record and the history shows up here."
                action={<Button onClick={openAddTx}>+ Add</Button>}
              />
            )}
          </GlassCard>
        ) : (
          // One ledger, not one card per day: with a handful of entries spread
          // across the month, every row used to arrive as its own floating
          // panel under its own heading, and nine transactions filled half a
          // screen. The day is a divider inside the list now, and it carries
          // that day's net so the column reads like a statement.
          <GlassCard
            title="Ledger"
            subtitle={
              filtering
                ? `${ledgerTx.length} match${ledgerTx.length === 1 ? "" : "es"} ${
                    spanningAll ? "across every month" : `in ${formatMonth(month)}`
                  }`
                : `${monthTxCount} entr${monthTxCount === 1 ? "y" : "ies"} in ${formatMonth(month)}`
            }
            icon={<Icon name="receipt" />}
            action={
              <Button variant="ghost" onClick={openAddTx}>
                + Add
              </Button>
            }
          >
            {elsewhereCount > 0 && (
              <p className="mb-3 flex flex-wrap items-center gap-2 rounded-field bg-ghost px-3 py-2 text-xs text-ink-2">
                {elsewhereCount} more match{elsewhereCount === 1 ? "" : "es"} outside{" "}
                {formatMonth(month)}.
                <button
                  type="button"
                  onClick={() => setSearchAll(true)}
                  className="font-semibold text-accent underline-offset-2 hover:underline"
                >
                  Search every month
                </button>
              </p>
            )}
            <div className="-mx-1.5">
              {days.map((day) => {
                const planned = day > today;
                const dayNet = byDay
                  .get(day)!
                  .filter((t) => t.type !== "transfer")
                  .reduce(
                    (sum, t) =>
                      sum +
                      (t.type === "income" ? 1 : -1) *
                        convert(t.amount, t.currency, base, settings.rates),
                    0,
                  );
                return (
                  <section key={day} className={planned ? "opacity-75" : ""}>
                    <h3 className="flex items-baseline justify-between gap-3 border-b border-hairline px-1.5 pb-1.5 pt-3 text-xs font-medium text-ink-3 first:pt-0">
                      <span className="flex items-center gap-2">
                        {/* results can span years once the search leaves the
                            month, and "21 Jul" alone would not say which */}
                        {spanningAll ? formatDate(day) : formatDateShort(day)}
                        {/* a quiet word, not a badge: in an open month every
                            single day carries it, and nine filled pills in a
                            row shouted louder than the amounts */}
                        {planned && <span className="tracking-wide">planned</span>}
                      </span>
                      {/* only worth printing when the day has more than one row
                          to add up — otherwise it just repeats the amount below */}
                      {byDay.get(day)!.length > 1 && (
                        <span className="tnum shrink-0">
                          {formatMoney(dayNet, base, { compact: true, sign: true })}
                        </span>
                      )}
                    </h3>
                    <div className="py-1">
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
                        className="row-tap flex w-full items-center gap-3 px-1.5 py-2 text-left"
                      >
                        <span
                          aria-hidden
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ghost text-base"
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
          </GlassCard>
        )}
        </div>

        <div className="space-y-4 sm:space-y-5 xl:col-span-2">
        {/* subscriptions */}
        <GlassCard
          title="Subscriptions"
          subtitle="Recurring services"
          icon={<Icon name="device" />}
          action={
            <Button variant="ghost" onClick={openAddSub}>
              + Add
            </Button>
          }
        >
          {state.subscriptions.length === 0 ? (
            <EmptyState
              icon={<Icon name="device" />}
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
          icon={<Icon name="repeat" />}
          action={
            <Button variant="ghost" onClick={openAddRec}>
              + Add
            </Button>
          }
        >
          {state.recurring.length === 0 ? (
            <EmptyState
              icon={<Icon name="repeat" />}
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
          icon={<Icon name="target" />}
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
              icon={<Icon name="target" />}
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
                        <ProgressMeter
                          value={spent}
                          max={b.limit}
                          tone="budget"
                          label={`${cat?.name ?? "Uncategorized"} budget`}
                        />
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
          onSubmit={saveTx}
          problem={txProblem}
          title={txForm.id ? "Edit transaction" : "New transaction"}
          footer={
            <>
              {txForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmTxDelete(true)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setTxForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!txValid}>
                Save
              </Button>
            </>
          }
        >
          <SegmentedControl
            label="Kind of entry"
            options={txTypeOptions}
            value={txForm.type}
            onChange={(t) => setTxForm(switchTxType(txForm, t))}
          />
          {!canTransfer && (
            <p className="-mt-1 text-xs text-ink-3">
              Transfers need two accounts — add another on Balance.
            </p>
          )}

          {txForm.type === "transfer" ? (
            <>
              {/* two selects abreast need the room for "🏦 Monobank card (UAH)"
                  plus a chevron chip; on a phone that is about 90px of text */}
              <div className="grid gap-3 sm:grid-cols-2">
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
                  prefix={CURRENCY_SYMBOL[fromAccount?.currency ?? txForm.currency]}
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
                    prefix={toAccount ? CURRENCY_SYMBOL[toAccount.currency] : undefined}
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
                  // the sign follows the currency picker right below it, so the
                  // field always says what the number is denominated in
                  prefix={CURRENCY_SYMBOL[txForm.currency]}
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                />
              </Field>
              <FieldSet label="Currency">
                <SegmentedControl
                  label="Currency"
                  options={CURRENCY_OPTIONS}
                  value={txForm.currency}
                  onChange={(c) => setTxForm({ ...txForm, currency: c })}
                />
              </FieldSet>
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
        </Sheet>
      )}

      {/* recurring sheet */}
      {recForm && (
        <Sheet
          open
          onClose={() => setRecForm(null)}
          onSubmit={saveRec}
          problem={recProblem}
          title={recForm.id ? "Edit recurring rule" : "New recurring rule"}
          footer={
            <>
              {recForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmRecDelete(true)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRecForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!recValid}>
                Save
              </Button>
            </>
          }
        >
          {recForm.id && (
            <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">
              Saving rewrites every month this rule posted, the ones already recorded
              included — so the ledger keeps matching the rule.
            </p>
          )}
          <SegmentedControl
            label="Kind of entry"
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
              prefix={CURRENCY_SYMBOL[recForm.currency]}
              value={recForm.amount}
              onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })}
            />
          </Field>
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCY_OPTIONS}
              value={recForm.currency}
              onChange={(c) => setRecForm({ ...recForm, currency: c })}
            />
          </FieldSet>
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
          <FieldSet label="From">
            <MonthInput
              name="From"
              value={recForm.startMonth}
              onChange={(startMonth) => setRecForm({ ...recForm, startMonth })}
            />
          </FieldSet>
          <FieldSet label="Until (optional)" hint="Leave empty to keep it running">
            <MonthInput
              name="Until"
              allowEmpty
              value={recForm.endMonth}
              onChange={(endMonth) => setRecForm({ ...recForm, endMonth })}
            />
          </FieldSet>
        </Sheet>
      )}

      {/* subscription sheet */}
      {subForm && (
        <Sheet
          open
          onClose={() => setSubForm(null)}
          onSubmit={saveSub}
          problem={subProblem}
          title={subForm.id ? "Edit subscription" : "New subscription"}
          footer={
            <>
              {subForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmSubDelete(true)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSubForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!subValid}>
                Save
              </Button>
            </>
          }
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
          <FieldSet label="Icon">
            <OptionChips
              label="Icon"
              size="lg"
              options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
              value={subForm.icon}
              onChange={(icon) => setSubForm({ ...subForm, icon })}
            />
          </FieldSet>
          <FieldSet label="Billing period">
            <SegmentedControl
              label="Billing period"
              options={PERIOD_OPTIONS}
              value={subForm.period}
              onChange={(p) => setSubForm({ ...subForm, period: p })}
            />
          </FieldSet>
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
              prefix={CURRENCY_SYMBOL[subForm.currency]}
              value={subForm.price}
              onChange={(e) => setSubForm({ ...subForm, price: e.target.value })}
              placeholder={subForm.period === "yearly" ? "1188" : "99"}
            />
          </Field>
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCY_OPTIONS}
              value={subForm.currency}
              onChange={(c) => setSubForm({ ...subForm, currency: c })}
            />
          </FieldSet>
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
          <FieldSet
            label="Billing from"
            hint="Charges are posted from this month onwards, past months included"
          >
            <MonthInput
              name="Billing from"
              value={subForm.startMonth}
              onChange={(startMonth) => setSubForm({ ...subForm, startMonth })}
            />
          </FieldSet>
        </Sheet>
      )}

      {/* budget sheet */}
      {budgetForm && (
        <Sheet
          open
          onClose={() => setBudgetForm(null)}
          onSubmit={saveBudget}
          problem={budgetProblem}
          title={budgetForm.editingId ? "Edit budget" : "New budget"}
          footer={
            <>
              {budgetForm.editingId && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmBudgetDelete(true)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setBudgetForm(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!budgetValid}>
                Save
              </Button>
            </>
          }
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
              prefix={CURRENCY_SYMBOL[budgetForm.currency]}
              value={budgetForm.limit}
              onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })}
            />
          </Field>
          <FieldSet label="Currency">
            <SegmentedControl
              label="Currency"
              options={CURRENCY_OPTIONS}
              value={budgetForm.currency}
              onChange={(c) => setBudgetForm({ ...budgetForm, currency: c })}
            />
          </FieldSet>
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
        message={`The rule and the ${postedCount("recurring", recForm?.id ?? null)} transactions it posted are removed, in past and future months alike.`}
      />
      <ConfirmDialog
        open={confirmSubDelete}
        onClose={() => setConfirmSubDelete(false)}
        onConfirm={deleteSub}
        title="Delete this subscription?"
        message={`The subscription and the ${postedCount("subscription", subForm?.id ?? null)} charges it posted are removed, in past and future months alike. To keep those charges, switch it off instead.`}
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
