"use client";

import { useState } from "react";
import {
  CURRENCIES,
  CURRENCY_SYMBOL,
  ICON_CHOICES,
  SUBSCRIPTION_SLOT,
} from "@/lib/constants";
import {
  addMonths,
  currentMonth,
  dateInMonth,
  daysInMonth,
  formatDate,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  monthDiff,
  monthOf,
  todayISO,
} from "@/lib/date";
import {
  expensesByCategory,
  monthTotals,
  monthlySeries,
  rollupToParents,
  spentInCategory,
  subscriptionBillsIn,
  subscriptionMonthlyCost,
  subscriptionsMonthlyTotal,
  subscriptionStatus,
  type SubscriptionStatus,
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
import { useT } from "@/lib/i18n";
import { matchesQuery, oneOf, sortItems, usePersistentState } from "@/lib/listing";
import type {
  Budget,
  Category,
  Currency,
  CategoryKind,
  RecurringRule,
  Subscription,
  SubscriptionPeriod,
  Transaction,
  TxType,
} from "@/lib/types";
import {
  AddButton,
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  FieldSet,
  FilterPills,
  GlassCard,
  IconDisc,
  MonthInput,
  Money,
  OptionChips,
  PageHeader,
  ProgressMeter,
  SearchInput,
  SegmentedControl,
  Sheet,
  SortSelect,
  TextInput,
  Toolbar,
  ToolbarSlot,
} from "@/components/ui";
import {
  CategoryBreakdown,
  MonthlyColumns,
  PeriodTabs,
  StatTile,
  type BreakdownSegment,
} from "@/components/charts";
import { categoryTree, descendantsOf, useAccountGroups, useCategoryGroups } from "@/components/category-select";
import { OptionPicker } from "@/components/picker";
import { Icon } from "@/components/icons";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

type LedgerSort = "date" | "amount" | "category" | "account";
type LedgerScope = "month" | "quarter" | "year" | "all";
type LedgerTiming = "all" | "posted" | "planned";
type SubView = "now" | "upcoming" | "ended" | "paused" | "all";
type SubSort = "name" | "price" | "day";
type RecView = "now" | "upcoming" | "ended" | "all";

interface TxForm {
  id: string | null;
  type: TxType;
  amount: string;
  currency: Currency;
  categoryId: string;
  date: string;
  note: string;
  accountId: string;
  toAccountId: string;
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
  endMonth: string;
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
  startMonth: string;
  endMonth: string;
}

interface BudgetForm {
  editingId: string | null;
  categoryId: string;
  limit: string;
  currency: Currency;
}

function recurringStatus(rule: RecurringRule, month: string): Exclude<RecView, "all"> {
  if (rule.startMonth > month) return "upcoming";
  if (rule.endMonth && rule.endMonth < month) return "ended";
  return "now";
}

export function TransactionsPage() {
  const { state, update } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const nowMonth = currentMonth();
  const today = todayISO();

  const [month, setMonth] = useState(nowMonth);
  const [query, setQuery] = useState("");
  const [ledgerType, setLedgerType] = useState<TxType | "all">("all");
  const [ledgerCategory, setLedgerCategory] = useState("");
  const [ledgerAccount, setLedgerAccount] = useState("");
  const [ledgerScope, setLedgerScope] = usePersistentState<LedgerScope>(
    "ledger.scope",
    "month",
    oneOf(["month", "quarter", "year", "all"] as const),
  );
  const [ledgerTiming, setLedgerTiming] = useState<LedgerTiming>("all");
  const [ledgerSort, setLedgerSort] = usePersistentState<LedgerSort>(
    "ledger.sort",
    "date",
    oneOf(["date", "amount", "category", "account"] as const),
  );
  const [ledgerDir, setLedgerDir] = usePersistentState<"asc" | "desc">("ledger.dir", "desc", oneOf(["asc", "desc"] as const));
  const [spendDetail, setSpendDetail] = usePersistentState<"groups" | "detailed">("spend.detail", "groups", oneOf(["groups", "detailed"] as const));
  const [subView, setSubView] = useState<SubView>("now");
  const [subSort, setSubSort] = usePersistentState<SubSort>("subs.sort", "name", oneOf(["name", "price", "day"] as const));
  const [subDir, setSubDir] = usePersistentState<"asc" | "desc">("subs.dir", "asc", oneOf(["asc", "desc"] as const));
  const [recView, setRecView] = useState<RecView>("now");
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
    categoryTree(state.categories, kind)[0]?.parent.id ?? "";
  const catLabel = (c: Category | undefined) => category(c);

  const canGoNext = monthDiff(nowMonth, month) < PLANNING_HORIZON_MONTHS - 1;
  const totals = monthTotals(state.transactions, month, settings);
  const prevTotals = monthTotals(state.transactions, addMonths(month, -1), settings);
  const hasPrev = prevTotals.income > 0 || prevTotals.expense > 0;
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
      .reduce((sum, tx) => sum + convert(tx.amount, tx.currency, base, settings.rates), 0);
  const stillAhead = (total: number, ahead: number) =>
    ahead > 0
      ? t("tx.soFarPlanned", {
          soFar: formatMoney(total - ahead, base, { compact: true }),
          planned: formatMoney(ahead, base, { compact: true }),
        })
      : undefined;

  const [flowMonths, setFlowMonths] = useState(6);
  const flowSeries = monthlySeries(state.transactions, month, flowMonths, settings);
  const rawByCategory = expensesByCategory(state.transactions, month, settings);
  const spendMap = spendDetail === "groups" ? rollupToParents(rawByCategory, state.categories) : rawByCategory;
  const spendSegments: BreakdownSegment[] = [...spendMap.entries()].map(([categoryId, value]) => {
    const cat = catById.get(categoryId);
    return {
      id: categoryId,
      label: catLabel(cat),
      icon: cat?.icon ?? "❓",
      value,
      colorSlot: cat?.colorSlot ?? 3,
    };
  });
  const hasAnyTx = state.transactions.length > 0;
  const hasSubcategorySpend = [...rawByCategory.keys()].some((id) => catById.get(id)?.parentId);

  const digits = (v: string) => v.replace(/[^\d]/g, "");
  const q = query.trim().toLowerCase();
  const qDigits = digits(q);
  const ledgerCats = ledgerCategory ? descendantsOf(state.categories, ledgerCategory) : null;
  const filtering =
    q !== "" || ledgerType !== "all" || ledgerCategory !== "" || ledgerAccount !== "" || ledgerTiming !== "all";
  const matchesFilter = (tx: Transaction) => {
    if (ledgerType !== "all" && tx.type !== ledgerType) return false;
    if (ledgerTiming === "posted" && tx.date > today) return false;
    if (ledgerTiming === "planned" && tx.date <= today) return false;
    if (ledgerCats && !ledgerCats.has(tx.categoryId)) return false;
    if (ledgerAccount && tx.accountId !== ledgerAccount && tx.toAccountId !== ledgerAccount) return false;
    if (!q) return true;
    const cat = catById.get(tx.categoryId);
    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    if (matchesQuery(q, tx.note, cat ? catLabel(cat) : undefined, from?.name, to?.name, tx.currency, formatDate(tx.date)))
      return true;
    return qDigits.length > 0 && digits(String(tx.amount)).includes(qDigits);
  };
  const clearLedgerFilters = () => {
    setQuery("");
    setLedgerType("all");
    setLedgerCategory("");
    setLedgerAccount("");
    setLedgerTiming("all");
  };

  const ledgerCategoryGroups = useCategoryGroups(state.categories, ["expense", "income"], [
    { value: "", label: t("filter.allCategories") },
  ]);
  const ledgerAccountGroups = useAccountGroups(state.savings, [{ value: "", label: t("filter.allAccounts") }]);
  const expenseCategoryGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeCategoryGroups = useCategoryGroups(state.categories, ["income"]);
  const accountGroups = useAccountGroups(state.savings);
  const optionalAccountGroups = useAccountGroups(state.savings, [
    { value: "", label: t("common.notAssigned") },
  ]);

  const monthTx = state.transactions.filter((tx) => monthOf(tx.date) === month);
  const monthTxCount = monthTx.length;
  const scopeStart =
    ledgerScope === "quarter" ? addMonths(month, -2) : ledgerScope === "year" ? `${month.slice(0, 4)}-01` : month;
  const scopeEnd = ledgerScope === "year" ? `${month.slice(0, 4)}-12` : month;
  const inScope = (tx: Transaction) => {
    if (ledgerScope === "all") return true;
    const m = monthOf(tx.date);
    return m >= scopeStart && m <= scopeEnd;
  };
  const scopedTx = state.transactions.filter(inScope);
  const plannedCount = scopedTx.filter((tx) => tx.date > today).length;
  const spanningAll = ledgerScope !== "month";
  const ledgerTx = scopedTx.filter(matchesFilter);
  const signedBase = (tx: Transaction) =>
    (tx.type === "expense" ? -1 : 1) * convert(tx.amount, tx.currency, base, settings.rates);
  const ledgerNet = ledgerTx.reduce((sum, tx) => (tx.type === "transfer" ? sum : sum + signedBase(tx)), 0);

  const byDay = new Map<string, Transaction[]>();
  for (const tx of ledgerTx) {
    const list = byDay.get(tx.date);
    if (list) list.push(tx);
    else byDay.set(tx.date, [tx]);
  }
  const days = sortItems([...byDay.keys()], (d) => d, ledgerDir);
  const flatLedger = sortItems(
    ledgerTx,
    (tx) =>
      ledgerSort === "amount"
        ? Math.abs(signedBase(tx))
        : ledgerSort === "category"
          ? catLabel(catById.get(tx.categoryId)).toLocaleLowerCase()
          : (tx.accountId ? (accountById.get(tx.accountId)?.name ?? "") : "").toLocaleLowerCase(),
    ledgerDir,
  );

  const budgetSpent = (b: Budget) => {
    let sum = 0;
    for (const id of descendantsOf(state.categories, b.categoryId)) {
      sum += spentInCategory(state.transactions, id, month, b.currency, settings);
    }
    return sum;
  };

  const budgetTotals = state.budgets.reduce(
    (acc, b) => {
      acc.limit += convert(b.limit, b.currency, base, settings.rates);
      acc.spent += convert(budgetSpent(b), b.currency, base, settings.rates);
      return acc;
    },
    { limit: 0, spent: 0 },
  );
  const unbudgeted = totals.expense - budgetTotals.spent;

  const expenseCats = state.categories.filter((c) => c.kind === "expense");
  const budgetedIds = new Set(state.budgets.map((b) => b.categoryId));
  const freeBudgetCats = expenseCats.filter((c) => !budgetedIds.has(c.id));
  const budgetCatOptions = budgetForm
    ? expenseCats.filter((c) => !budgetedIds.has(c.id) || c.id === budgetForm.editingId)
    : [];
  const budgetCategoryGroups = useCategoryGroups(budgetCatOptions, ["expense"]);

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

  const canTransfer = state.savings.length >= 2;
  const txTypeOptions: Array<{ value: TxType; label: string }> = [
    { value: "expense", label: t("tx.type.expense") },
    { value: "income", label: t("tx.type.income") },
    ...(canTransfer ? [{ value: "transfer" as const, label: t("tx.type.transfer") }] : []),
  ];

  const fromAccount = txForm ? accountById.get(txForm.accountId) : undefined;
  const toAccount = txForm ? accountById.get(txForm.toAccountId) : undefined;
  const crossCurrency =
    txForm?.type === "transfer" &&
    fromAccount != null &&
    toAccount != null &&
    fromAccount.currency !== toAccount.currency;

  const txAmount = txForm ? parseAmount(txForm.amount) : NaN;
  const txToAmount = txForm ? parseAmount(txForm.toAmount) : NaN;

  const impliedRate =
    crossCurrency && fromAccount && toAccount && Number.isFinite(txAmount) && txAmount > 0
      ? formatMoney(
          convert(txAmount, fromAccount.currency, toAccount.currency, settings.rates) / txAmount,
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

  const txProblem: string | null =
    txForm === null || txValid
      ? null
      : !Number.isFinite(txAmount) || txAmount <= 0
        ? t("problem.amount")
        : !/^\d{4}-\d{2}-\d{2}$/.test(txForm.date)
          ? t("problem.date")
          : txForm.type !== "transfer"
            ? t("problem.category")
            : txForm.accountId === "" || txForm.toAccountId === ""
              ? t("tx.problem.bothAccounts")
              : txForm.accountId === txForm.toAccountId
                ? t("tx.problem.sameAccount")
                : t("tx.problem.arrived", { name: toAccount?.name ?? t("tx.destination") });

  const saveTx = () => {
    if (!txForm || !txValid) return;
    const isTransfer = txForm.type === "transfer";
    const patch: Omit<Transaction, "id"> = isTransfer
      ? {
          type: "transfer",
          amount: txAmount,
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
        ? s.transactions.map((tx) =>
            tx.id === txForm.id
              ? { id: tx.id, recurringId: tx.recurringId, subscriptionId: tx.subscriptionId, ...patch }
              : tx,
          )
        : [...s.transactions, { id: uid(), ...patch }],
    }));
    setTxForm(null);
  };

  const deleteTx = () => {
    const id = txForm?.id;
    if (!id) return;
    update((s) => ({ ...s, transactions: s.transactions.filter((tx) => tx.id !== id) }), t("tx.deleted"));
    setTxForm(null);
  };

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
        ? t("problem.amount")
        : !Number.isInteger(recDay) || recDay < 1 || recDay > 31
          ? t("problem.day")
          : recForm.categoryId === ""
            ? t("problem.category")
            : t("problem.endBeforeStart");

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
    update((s) => deleteSchedule(s, "recurring", id), t("tx.recurring.deleted"));
    setRecForm(null);
  };

  const postedCount = (kind: "recurring" | "subscription", id: string | null) =>
    id === null
      ? 0
      : state.transactions.filter((tx) =>
          kind === "recurring" ? tx.recurringId === id : tx.subscriptionId === id,
        ).length;

  const subsSlot =
    state.categories.find((c) => c.id === "cat-subs")?.colorSlot ?? SUBSCRIPTION_SLOT;

  const monthSubs = state.subscriptions.filter((sub) => subscriptionBillsIn(sub, month));
  const subsTotal = subscriptionsMonthlyTotal(monthSubs, base, settings);
  const subCounts: Record<SubscriptionStatus, number> = { active: 0, upcoming: 0, ended: 0, paused: 0 };
  for (const sub of state.subscriptions) subCounts[subscriptionStatus(sub, month)]++;
  const viewToStatus: Record<Exclude<SubView, "all">, SubscriptionStatus> = {
    now: "active",
    upcoming: "upcoming",
    ended: "ended",
    paused: "paused",
  };
  const visibleSubs = sortItems(
    state.subscriptions.filter(
      (sub) => subView === "all" || subscriptionStatus(sub, month) === viewToStatus[subView],
    ),
    (sub) =>
      subSort === "price"
        ? subscriptionMonthlyCost(sub, base, settings)
        : subSort === "day"
          ? sub.dayOfMonth
          : sub.name.toLocaleLowerCase(),
    subDir,
  );
  const subViewOptions = (
    [
      { value: "now", label: t("tx.subs.view.now"), count: subCounts.active },
      { value: "upcoming", label: t("tx.subs.view.upcoming"), count: subCounts.upcoming },
      { value: "ended", label: t("tx.subs.view.ended"), count: subCounts.ended },
      { value: "paused", label: t("tx.subs.view.paused"), count: subCounts.paused },
      { value: "all", label: t("tx.subs.view.all"), count: state.subscriptions.length },
    ] as Array<{ value: SubView; label: string; count: number }>
  ).filter((o) => o.value === "now" || o.value === "all" || o.count > 0 || o.value === subView);

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
      endMonth: "",
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
      endMonth: sub.endMonth ?? "",
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
    /^\d{4}-\d{2}$/.test(subForm.startMonth) &&
    (subForm.endMonth === "" || subForm.endMonth >= subForm.startMonth);

  const subProblem: string | null =
    subForm === null || subValid
      ? null
      : subForm.name.trim() === ""
        ? t("tx.subs.problem.name")
        : !Number.isFinite(subPrice) || subPrice <= 0
          ? t("tx.subs.problem.price")
          : !Number.isInteger(subDay) || subDay < 1 || subDay > 31
            ? t("problem.day")
            : t("problem.endBeforeStart");

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
      endMonth: subForm.endMonth || undefined,
    };
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

  const editingSub = subForm?.id ? state.subscriptions.find((s) => s.id === subForm.id) : undefined;

  const resumeSub = () => {
    const id = subForm?.id;
    if (!id) return;
    update(
      (s) =>
        remateralizeRecurring({
          ...s,
          subscriptions: s.subscriptions.map((sub) => (sub.id === id ? { ...sub, active: true } : sub)),
        }),
      t("tx.subs.resumed"),
    );
  };

  const deleteSub = () => {
    const id = subForm?.id;
    if (!id) return;
    update((s) => deleteSchedule(s, "subscription", id), t("tx.subs.deleted"));
    setSubForm(null);
  };

  const recCounts: Record<Exclude<RecView, "all">, number> = { now: 0, upcoming: 0, ended: 0 };
  for (const rule of state.recurring) recCounts[recurringStatus(rule, month)]++;
  const visibleRecurring = sortItems(
    state.recurring.filter((rule) => recView === "all" || recurringStatus(rule, month) === recView),
    (rule) => rule.dayOfMonth,
    "asc",
  );
  const recViewOptions = (
    [
      { value: "now", label: t("tx.rec.view.now"), count: recCounts.now },
      { value: "upcoming", label: t("tx.rec.view.upcoming"), count: recCounts.upcoming },
      { value: "ended", label: t("tx.rec.view.ended"), count: recCounts.ended },
      { value: "all", label: t("tx.rec.view.all"), count: state.recurring.length },
    ] as Array<{ value: RecView; label: string; count: number }>
  ).filter((o) => o.value === "now" || o.value === "all" || o.count > 0 || o.value === recView);

  const openAddBudget = () => {
    const first = freeBudgetCats[0];
    if (!first) return;
    setBudgetForm({ editingId: null, categoryId: first.id, limit: "", currency: base });
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
    budgetForm !== null && Number.isFinite(budgetLimit) && budgetLimit > 0 && budgetForm.categoryId !== "";

  const budgetProblem: string | null =
    budgetForm === null || budgetValid
      ? null
      : budgetForm.categoryId === ""
        ? t("problem.category")
        : t("tx.budget.problem.limit");

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
          (b) => b.categoryId !== budgetForm.editingId && b.categoryId !== budgetForm.categoryId,
        ),
        entry,
      ],
    }));
    setBudgetForm(null);
  };

  const deleteBudget = () => {
    const id = budgetForm?.editingId;
    if (!id) return;
    update((s) => ({ ...s, budgets: s.budgets.filter((b) => b.categoryId !== id) }), t("tx.budget.deleted"));
    setBudgetForm(null);
  };

  const addButton = (variant: "primary" | "ghost", onClick: () => void, disabled = false) => (
    <AddButton variant={variant} onClick={onClick} disabled={disabled} label={t("common.add")} />
  );

  const renderTx = (tx: Transaction, showDate: boolean) => {
    const cat = catById.get(tx.categoryId);
    const isTransfer = tx.type === "transfer";
    const from = tx.accountId ? accountById.get(tx.accountId) : undefined;
    const to = tx.toAccountId ? accountById.get(tx.toAccountId) : undefined;
    const parent = cat?.parentId ? catById.get(cat.parentId) : undefined;
    return (
      <button
        key={tx.id}
        type="button"
        onClick={() => openEditTx(tx)}
        className="row-tap flex w-full items-center gap-3 px-1.5 py-2 text-left"
      >
        <IconDisc colorSlot={isTransfer ? undefined : cat?.colorSlot} className="size-9 rounded-full text-base">
          {isTransfer ? "⇄" : (cat?.icon ?? "❓")}
        </IconDisc>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-1">
            {isTransfer ? `${from?.name ?? "?"} → ${to?.name ?? "?"}` : catLabel(cat)}
          </span>
          <span className="block truncate text-xs text-ink-3">
            {isTransfer
              ? tx.toAmount != null && to && tx.toAmount !== tx.amount
                ? t("tx.arrivesAs", { amount: formatMoney(tx.toAmount, to.currency, { exact: true }) })
                : (tx.note ?? t("tx.type.transfer"))
              : [showDate ? formatDateShort(tx.date) : null, parent ? catLabel(parent) : null, tx.note, from?.name]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </span>
        <Money
          amount={tx.type === "expense" ? -tx.amount : tx.amount}
          currency={tx.currency}
          sign={!isTransfer}
          className={`shrink-0 text-sm font-semibold ${
            isTransfer ? "text-ink-2" : tx.type === "income" ? "text-income" : "text-expense"
          }`}
        />
      </button>
    );
  };

  const statusBadge = (status: SubscriptionStatus | Exclude<RecView, "all">) => {
    if (status === "active" || status === "now") return null;
    const label =
      status === "upcoming" ? t("tx.status.upcoming") : status === "ended" ? t("tx.status.ended") : t("tx.status.paused");
    return <Badge tone={status === "ended" ? "neutral" : status === "paused" ? "warning" : "accent"}>{label}</Badge>;
  };

  return (
    <>
      <PageHeader title={t("tx.title")} subtitle={t("tx.subtitle")} action={addButton("primary", openAddTx)} />
      <div className="stagger space-y-4 sm:space-y-5">
        <div className="glass flex items-center gap-3 rounded-card px-4 py-3">
          <button
            type="button"
            aria-label={t("month.previous")}
            onClick={() => setMonth(addMonths(month, -1))}
            className="icon-btn size-10 shrink-0 border border-hairline bg-ghost text-ink-2 shadow-[inset_0_1px_0_var(--card-highlight)]"
          >
            <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <span className="body-strong flex items-center gap-2 font-semibold">
              <span className="truncate">{formatMonth(month)}</span>
              {month === nowMonth && (
                <span className="hidden rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent sm:inline">
                  {t("month.this")}
                </span>
              )}
            </span>
            <span className="tnum text-xs text-ink-3">
              {tp("common.entries", monthTxCount)} ·{" "}
              <span className={totals.net >= 0 ? "text-income" : "text-expense"}>
                {formatMoney(totals.net, base, { compact: true, sign: true })}
              </span>
            </span>
          </div>
          {month !== nowMonth && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setMonth(nowMonth)}>
              {t("month.today")}
            </Button>
          )}
          <button
            type="button"
            aria-label={t("month.next")}
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={!canGoNext}
            className="icon-btn size-10 shrink-0 border border-hairline bg-ghost text-ink-2 shadow-[inset_0_1px_0_var(--card-highlight)] disabled:opacity-40"
          >
            <Icon name="chevronRight" size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">
          <StatTile
            label={t("tx.stat.income")}
            href="/income"
            value={formatMoney(totals.income, base, { compact: true })}
            tone="income"
            spark={flowSeries.map((m) => m.income)}
            delta={vsLast(totals.income, prevTotals.income)}
            hint={stillAhead(totals.income, plannedIn("income"))}
          />
          <StatTile
            label={t("tx.stat.expenses")}
            value={formatMoney(totals.expense, base, { compact: true })}
            tone="expense"
            spark={flowSeries.map((m) => m.expense)}
            delta={vsLast(totals.expense, prevTotals.expense, true)}
            hint={
              stillAhead(totals.expense, plannedIn("expense")) ??
              (totals.income > 0
                ? t("tx.stat.ofIncome", { pct: formatPercent((totals.expense / totals.income) * 100, 0) })
                : undefined)
            }
          />
          <StatTile
            className="col-span-2 md:col-span-1"
            label={t("tx.stat.net")}
            value={formatMoney(totals.net, base, { sign: true, compact: true })}
            tone={totals.net < 0 ? "expense" : "income"}
            spark={flowSeries.map((m) => m.income - m.expense)}
            delta={vsLast(totals.net, prevTotals.net)}
            hint={t("tx.stat.perDay", {
              amount: formatMoney(totals.expense / daysInMonth(month), base, { compact: true }),
            })}
          />
        </div>

        {hasAnyTx && (
          <div className="grid items-stretch gap-4 sm:gap-5 lg:grid-cols-2">
            <GlassCard
              title={t("tx.where")}
              subtitle={formatMonth(month)}
              icon="pie"
              className="flex flex-col"
              action={
                hasSubcategorySpend ? (
                  <SegmentedControl
                    size="sm"
                    label={t("tx.where.detail")}
                    options={[
                      { value: "groups", label: t("tx.where.groups") },
                      { value: "detailed", label: t("tx.where.detailed") },
                    ]}
                    value={spendDetail}
                    onChange={setSpendDetail}
                  />
                ) : undefined
              }
            >
              {spendSegments.length > 0 ? (
                <div className="flex flex-1 flex-col justify-center">
                  <div className="mb-3.5 flex items-end justify-between gap-3">
                    <p className="num-md whitespace-nowrap text-ink-1">
                      {formatMoney(totals.expense, base, { compact: true })}
                    </p>
                    <p className="caption">{tp("common.categories", spendSegments.length)}</p>
                  </div>
                  <CategoryBreakdown segments={spendSegments} currency={base} />
                </div>
              ) : (
                <EmptyState
                  icon={<Icon name="receipt" />}
                  title={t("tx.where.empty")}
                  hint={t("tx.where.empty.hint")}
                />
              )}
            </GlassCard>
            <GlassCard
              title={t("tx.flow")}
              subtitle={t("tx.flow.subtitle")}
              icon="chart"
              action={<PeriodTabs value={flowMonths} onChange={setFlowMonths} />}
            >
              <MonthlyColumns
                data={flowSeries.map((m) => ({ month: m.month, income: m.income, expense: m.expense }))}
                currency={base}
                height={220}
              />
            </GlassCard>
          </div>
        )}

        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-5">
          <div className="min-w-0 space-y-4 sm:space-y-5 xl:col-span-3">
            <GlassCard
              title={t("tx.ledger")}
              subtitle={
                filtering
                  ? spanningAll
                    ? tp("tx.ledger.matchesAll", ledgerTx.length)
                    : tp("tx.ledger.matchesMonth", ledgerTx.length, { month: formatMonth(month) })
                  : tp("tx.ledger.entriesMonth", monthTxCount, { month: formatMonth(month) })
              }
              icon="receipt"
              action={addButton("ghost", openAddTx)}
            >
              {hasAnyTx && (
                <>
                  <Toolbar className="mb-2">
                    <SearchInput value={query} onChange={setQuery} placeholder={t("tx.search")} />
                    <SegmentedControl
                      size="sm"
                      label={t("tx.kind")}
                      className="flex-[1_0_auto] sm:flex-none"
                      options={[
                        { value: "all" as const, label: t("tx.kind.all") },
                        { value: "expense" as const, label: t("tx.kind.out") },
                        { value: "income" as const, label: t("tx.kind.in") },
                        { value: "transfer" as const, label: "⇄" },
                      ]}
                      value={ledgerType}
                      onChange={setLedgerType}
                    />
                  </Toolbar>
                  <Toolbar className="mb-2">
                    <FilterPills
                      label={t("filter.period")}
                      options={[
                        { value: "month" as const, label: formatMonthShort(month) },
                        { value: "quarter" as const, label: t("filter.period.quarter") },
                        { value: "year" as const, label: month.slice(0, 4) },
                        { value: "all" as const, label: t("filter.period.all") },
                      ]}
                      value={ledgerScope}
                      onChange={setLedgerScope}
                    />
                    {plannedCount > 0 && (
                      <FilterPills
                        label={t("filter.timing")}
                        options={[
                          { value: "all" as const, label: t("filter.all") },
                          { value: "posted" as const, label: t("filter.timing.posted") },
                          { value: "planned" as const, label: t("filter.timing.planned") },
                        ]}
                        value={ledgerTiming}
                        onChange={setLedgerTiming}
                      />
                    )}
                  </Toolbar>
                  <Toolbar>
                    <ToolbarSlot>
                      <OptionPicker
                        size="sm"
                        label={t("filter.category")}
                        value={ledgerCategory}
                        onChange={setLedgerCategory}
                        groups={ledgerCategoryGroups}
                      />
                    </ToolbarSlot>
                    {state.savings.length > 0 && (
                      <ToolbarSlot>
                        <OptionPicker
                          size="sm"
                          label={t("filter.account")}
                          value={ledgerAccount}
                          onChange={setLedgerAccount}
                          groups={ledgerAccountGroups}
                        />
                      </ToolbarSlot>
                    )}
                    <SortSelect
                      value={ledgerSort}
                      onChange={setLedgerSort}
                      options={[
                        { value: "date", label: t("sort.date") },
                        { value: "amount", label: t("sort.amount") },
                        { value: "category", label: t("filter.category") },
                        { value: "account", label: t("common.account") },
                      ]}
                      direction={ledgerDir}
                      onDirectionChange={setLedgerDir}
                    />
                    {filtering && (
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={clearLedgerFilters}>
                        {t("filter.reset")}
                      </Button>
                    )}
                  </Toolbar>
                  {ledgerTx.length > 0 && (
                    <p className="tnum mb-2 px-1 text-xs text-ink-3">
                      {tp("common.entries", ledgerTx.length)} ·{" "}
                      <span className={ledgerNet >= 0 ? "text-income" : "text-expense"}>
                        {formatMoney(ledgerNet, base, { sign: true, compact: true })}
                      </span>
                    </p>
                  )}
                </>
              )}
              {ledgerTx.length === 0 ? (
                filtering ? (
                  <EmptyState
                    icon={<Icon name="search" />}
                    title={t("filter.noMatches")}
                    hint={spanningAll ? t("tx.noMatch.all") : t("tx.noMatch.month", { month: formatMonth(month) })}
                    action={
                      <Button variant="ghost" onClick={clearLedgerFilters}>
                        {t("filter.reset")}
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Icon name="receipt" />}
                    title={t("tx.empty")}
                    hint={t("tx.empty.hint")}
                    action={addButton("primary", openAddTx)}
                  />
                )
              ) : ledgerSort !== "date" ? (
                <div className="-mx-1.5 py-1">{flatLedger.map((tx) => renderTx(tx, true))}</div>
              ) : (
                <div className="-mx-1.5">
                  {days.map((day) => {
                    const planned = day > today;
                    const rows = byDay.get(day)!;
                    const dayNet = rows
                      .filter((tx) => tx.type !== "transfer")
                      .reduce((sum, tx) => sum + signedBase(tx), 0);
                    return (
                      <section key={day} className={planned ? "opacity-75" : ""}>
                        <h3 className="flex items-baseline justify-between gap-3 border-b border-hairline px-1.5 pb-1.5 pt-3 text-xs font-medium text-ink-3 first:pt-0">
                          <span className="flex items-center gap-2">
                            {spanningAll ? formatDate(day) : formatDateShort(day)}
                            {planned && <span className="tracking-wide">{t("tx.planned")}</span>}
                          </span>
                          {rows.length > 1 && (
                            <span className="tnum shrink-0">
                              {formatMoney(dayNet, base, { compact: true, sign: true })}
                            </span>
                          )}
                        </h3>
                        <div className="py-1">{rows.map((tx) => renderTx(tx, false))}</div>
                      </section>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>

          <div className="min-w-0 space-y-4 sm:space-y-5 xl:col-span-2">
            <GlassCard
              title={t("tx.subs")}
              subtitle={t("tx.subs.subtitle")}
              icon="device"
              action={addButton("ghost", openAddSub)}
            >
              {state.subscriptions.length === 0 ? (
                <EmptyState
                  icon={<Icon name="device" />}
                  title={t("tx.subs.empty")}
                  hint={t("tx.subs.empty.hint")}
                  action={addButton("ghost", openAddSub)}
                />
              ) : (
                <>
                  <p className="mb-3 text-sm text-ink-2">
                    {t("tx.subs.billingIn", { month: formatMonth(month) })}{" "}
                    <span className="tnum font-semibold text-ink-1">
                      {formatMoney(subsTotal, base, { exact: true })}
                    </span>
                    <span className="caption">
                      {" "}
                      · {t("tx.subs.countOf", { n: monthSubs.length, total: state.subscriptions.length })}
                    </span>
                  </p>
                  <Toolbar>
                    <FilterPills
                      label={t("tx.subs.view")}
                      options={subViewOptions}
                      value={subView}
                      onChange={setSubView}
                    />
                    {visibleSubs.length > 1 && (
                      <SortSelect
                        value={subSort}
                        onChange={setSubSort}
                        options={[
                          { value: "name", label: t("sort.name") },
                          { value: "price", label: t("sort.price") },
                          { value: "day", label: t("sort.chargeDay") },
                        ]}
                        direction={subDir}
                        onDirectionChange={setSubDir}
                      />
                    )}
                  </Toolbar>
                  {visibleSubs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-2">
                      {subView === "now" ? t("tx.subs.noneThisMonth", { month: formatMonth(month) }) : t("filter.noMatches")}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {visibleSubs.map((sub) => {
                        const status = subscriptionStatus(sub, month);
                        return (
                          <li key={sub.id}>
                            <button
                              type="button"
                              onClick={() => openEditSub(sub)}
                              className={`row-tap flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left ${
                                status === "active" ? "" : "opacity-60"
                              }`}
                            >
                              <IconDisc colorSlot={subsSlot} className="size-9 rounded-full text-base">
                                {sub.icon}
                              </IconDisc>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-ink-1">{sub.name}</span>
                                  {statusBadge(status)}
                                </span>
                                <span className="block truncate text-xs text-ink-3">
                                  {sub.period === "yearly"
                                    ? t("tx.subs.yearly", { price: formatMoney(sub.price, sub.currency) })
                                    : t("tx.subs.monthlyDay", { day: sub.dayOfMonth })}
                                  {status === "upcoming" && ` · ${t("tx.subs.from", { month: formatMonth(sub.startMonth) })}`}
                                  {sub.endMonth &&
                                    ` · ${
                                      status === "ended"
                                        ? t("tx.subs.endedIn", { month: formatMonth(sub.endMonth) })
                                        : t("tx.subs.until", { month: formatMonth(sub.endMonth) })
                                    }`}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <Money
                                  amount={sub.period === "yearly" ? sub.price / 12 : sub.price}
                                  currency={sub.currency}
                                  exact
                                  className="block text-sm font-semibold text-ink-1"
                                />
                                <span className="block text-xs text-ink-3">{t("common.perMonth")}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </GlassCard>

            <GlassCard
              title={t("tx.rec")}
              subtitle={t("tx.rec.subtitle")}
              icon="repeat"
              action={addButton("ghost", openAddRec)}
            >
              {state.recurring.length === 0 ? (
                <EmptyState
                  icon={<Icon name="repeat" />}
                  title={t("tx.rec.empty")}
                  hint={t("tx.rec.empty.hint")}
                  action={addButton("ghost", openAddRec)}
                />
              ) : (
                <>
                  {state.recurring.length > 1 && (
                    <div className="mb-3">
                      <FilterPills
                        label={t("tx.rec.view")}
                        options={recViewOptions}
                        value={recView}
                        onChange={setRecView}
                      />
                    </div>
                  )}
                  {visibleRecurring.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-2">
                      {recView === "now" ? t("tx.rec.noneThisMonth", { month: formatMonth(month) }) : t("filter.noMatches")}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {visibleRecurring.map((rule) => {
                        const cat = catById.get(rule.categoryId);
                        const status = recurringStatus(rule, month);
                        return (
                          <li key={rule.id}>
                            <button
                              type="button"
                              onClick={() => openEditRec(rule)}
                              className={`row-tap flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                                status === "now" ? "" : "opacity-60"
                              }`}
                            >
                              <IconDisc colorSlot={cat?.colorSlot} className="size-10 rounded-full text-lg">
                                {cat?.icon ?? "❓"}
                              </IconDisc>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-sm font-medium text-ink-1">
                                    {catLabel(cat)}
                                    {rule.note && <span className="font-normal text-ink-3"> · {rule.note}</span>}
                                  </span>
                                  {statusBadge(status)}
                                </span>
                                <span className="tnum block text-xs text-ink-2">
                                  {t("tx.rec.line", {
                                    amount: formatMoney(rule.amount, rule.currency),
                                    day: rule.dayOfMonth,
                                  })}
                                </span>
                                <span className="block text-xs text-ink-3">
                                  {rule.endMonth
                                    ? t("tx.rec.range", {
                                        from: formatMonth(rule.startMonth),
                                        to: formatMonth(rule.endMonth),
                                      })
                                    : t("tx.rec.since", { from: formatMonth(rule.startMonth) })}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </GlassCard>

            <GlassCard
              title={t("tx.budgets")}
              subtitle={
                state.budgets.length > 0
                  ? t("tx.budgets.summary", {
                      month: formatMonth(month),
                      spent: formatMoney(budgetTotals.spent, base, { compact: true }),
                      limit: formatMoney(budgetTotals.limit, base, { compact: true }),
                    })
                  : t("tx.budgets.subtitle")
              }
              icon="target"
              action={addButton("ghost", openAddBudget, freeBudgetCats.length === 0)}
            >
              {state.budgets.length > 0 && (
                <div className="mb-4 border-b border-hairline pb-3.5">
                  <ProgressMeter
                    value={budgetTotals.spent}
                    max={budgetTotals.limit}
                    tone="budget"
                    label={t("tx.budgets.all")}
                  />
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span
                      className={`tnum text-sm font-semibold ${
                        budgetTotals.spent > budgetTotals.limit ? "text-expense" : "text-ink-1"
                      }`}
                    >
                      {budgetTotals.limit > budgetTotals.spent
                        ? t("tx.budgets.left", {
                            amount: formatMoney(budgetTotals.limit - budgetTotals.spent, base, { compact: true }),
                          })
                        : t("tx.budgets.over", {
                            amount: formatMoney(budgetTotals.spent - budgetTotals.limit, base, { compact: true }),
                          })}
                    </span>
                    {unbudgeted > 0.5 && (
                      <span className="caption">
                        {t("tx.budgets.outside", { amount: formatMoney(unbudgeted, base, { compact: true }) })}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {state.budgets.length === 0 ? (
                <EmptyState
                  icon={<Icon name="target" />}
                  title={t("tx.budgets.empty")}
                  hint={t("tx.budgets.empty.hint")}
                  action={addButton("ghost", openAddBudget)}
                />
              ) : (
                <ul className="space-y-1">
                  {sortItems(
                    state.budgets,
                    (b) => (b.limit > 0 ? budgetSpent(b) / b.limit : 0),
                    "desc",
                  ).map((b) => {
                    const cat = catById.get(b.categoryId);
                    const spent = budgetSpent(b);
                    const over = spent > b.limit;
                    const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
                    const subs = state.categories.filter((c) => c.parentId === b.categoryId).length;
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
                              {catLabel(cat)}
                              {subs > 0 && (
                                <span className="font-normal text-ink-3"> · {tp("tx.budgets.withSubs", subs)}</span>
                              )}
                            </span>
                            <span className={`tnum text-xs font-medium ${over ? "text-expense" : "text-ink-3"}`}>
                              {formatPercent(pct, 0)}
                            </span>
                          </span>
                          <span className="mt-2 block">
                            <ProgressMeter
                              value={spent}
                              max={b.limit}
                              tone="budget"
                              label={t("tx.budgets.itemLabel", { name: catLabel(cat) })}
                            />
                          </span>
                          <span className={`tnum mt-1.5 block text-xs ${over ? "text-expense" : "text-ink-3"}`}>
                            {t("tx.budgets.of", {
                              spent: formatMoney(spent, b.currency),
                              limit: formatMoney(b.limit, b.currency),
                            })}
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

      {txForm && (
        <Sheet
          open
          onClose={() => setTxForm(null)}
          onSubmit={saveTx}
          problem={txProblem}
          title={txForm.id ? t("tx.edit") : t("tx.new")}
          footer={
            <>
              {txForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmTxDelete(true)}>
                  {t("common.delete")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setTxForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!txValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <SegmentedControl
            label={t("tx.kind")}
            options={txTypeOptions}
            value={txForm.type}
            onChange={(type) => setTxForm(switchTxType(txForm, type))}
          />
          {!canTransfer && <p className="-mt-1 text-xs text-ink-3">{t("tx.transferNeedsTwo")}</p>}

          {txForm.type === "transfer" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("tx.fromAccount")}>
                  <OptionPicker
                    label={t("tx.fromAccount")}
                    value={txForm.accountId}
                    onChange={(accountId) =>
                      setTxForm({
                        ...txForm,
                        accountId,
                        currency: accountById.get(accountId)?.currency ?? txForm.currency,
                      })
                    }
                    groups={accountGroups}
                  />
                </Field>
                <Field label={t("tx.toAccount")}>
                  <OptionPicker
                    label={t("tx.toAccount")}
                    value={txForm.toAccountId}
                    onChange={(toAccountId) => setTxForm({ ...txForm, toAccountId })}
                    groups={accountGroups}
                  />
                </Field>
              </div>
              <Field label={fromAccount ? t("tx.amountSentIn", { currency: fromAccount.currency }) : t("tx.amountSent")}>
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
                  label={t("tx.amountReceived", { currency: toAccount?.currency ?? "" })}
                  hint={impliedRate ? t("tx.impliedRate", { rate: impliedRate }) : undefined}
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
              <Field label={t("common.amount")}>
                <TextInput
                  inputMode="decimal"
                  placeholder="0"
                  prefix={CURRENCY_SYMBOL[txForm.currency]}
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                />
              </Field>
              <FieldSet label={t("common.currency")}>
                <SegmentedControl
                  label={t("common.currency")}
                  options={CURRENCY_OPTIONS}
                  value={txForm.currency}
                  onChange={(c) => setTxForm({ ...txForm, currency: c })}
                />
              </FieldSet>
              <Field label={t("common.category")}>
                <OptionPicker
                  label={t("common.category")}
                  value={txForm.categoryId}
                  onChange={(categoryId) => setTxForm({ ...txForm, categoryId })}
                  groups={txForm.type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
                />
              </Field>
              <Field
                label={t("common.account")}
                hint={state.savings.length === 0 ? t("tx.account.none") : t("tx.account.hint")}
              >
                <OptionPicker
                  label={t("common.account")}
                  value={txForm.accountId}
                  onChange={(accountId) => setTxForm({ ...txForm, accountId })}
                  groups={optionalAccountGroups}
                />
              </Field>
            </>
          )}

          <Field label={t("common.date")}>
            <TextInput
              type="date"
              value={txForm.date}
              onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
            />
          </Field>
          <Field label={t("common.note")}>
            <TextInput
              placeholder={t("common.optional")}
              value={txForm.note}
              onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
            />
          </Field>
        </Sheet>
      )}

      {recForm && (
        <Sheet
          open
          onClose={() => setRecForm(null)}
          onSubmit={saveRec}
          problem={recProblem}
          title={recForm.id ? t("tx.rec.edit") : t("tx.rec.new")}
          footer={
            <>
              {recForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmRecDelete(true)}>
                  {t("common.delete")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRecForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!recValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          {recForm.id && (
            <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">
              {t("tx.rec.rewriteNote")}
            </p>
          )}
          <SegmentedControl
            label={t("tx.kind")}
            options={[
              { value: "expense" as const, label: t("tx.type.expense") },
              { value: "income" as const, label: t("tx.type.income") },
            ]}
            value={recForm.type}
            onChange={(type) => setRecForm({ ...recForm, type, categoryId: firstCategoryId(type) })}
          />
          <Field label={t("common.amount")}>
            <TextInput
              inputMode="decimal"
              placeholder="0"
              prefix={CURRENCY_SYMBOL[recForm.currency]}
              value={recForm.amount}
              onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })}
            />
          </Field>
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCY_OPTIONS}
              value={recForm.currency}
              onChange={(c) => setRecForm({ ...recForm, currency: c })}
            />
          </FieldSet>
          <Field label={t("common.category")}>
            <OptionPicker
              label={t("common.category")}
              value={recForm.categoryId}
              onChange={(categoryId) => setRecForm({ ...recForm, categoryId })}
              groups={recForm.type === "income" ? incomeCategoryGroups : expenseCategoryGroups}
            />
          </Field>
          <Field label={t("common.note")}>
            <TextInput
              placeholder={t("common.optional")}
              value={recForm.note}
              onChange={(e) => setRecForm({ ...recForm, note: e.target.value })}
            />
          </Field>
          <Field label={t("common.account")} hint={t("tx.schedule.accountHint")}>
            <OptionPicker
              label={t("common.account")}
              value={recForm.accountId}
              onChange={(accountId) => setRecForm({ ...recForm, accountId })}
              groups={optionalAccountGroups}
            />
          </Field>
          <Field label={t("tx.rec.day")} hint={t("tx.schedule.dayHint")}>
            <TextInput
              inputMode="numeric"
              value={recForm.day}
              onChange={(e) => setRecForm({ ...recForm, day: e.target.value })}
            />
          </Field>
          <FieldSet label={t("tx.schedule.from")}>
            <MonthInput
              name={t("tx.schedule.from")}
              value={recForm.startMonth}
              onChange={(startMonth) => setRecForm({ ...recForm, startMonth })}
            />
          </FieldSet>
          <FieldSet label={t("tx.schedule.until")} hint={t("tx.schedule.untilHint")}>
            <MonthInput
              name={t("tx.schedule.until")}
              allowEmpty
              value={recForm.endMonth}
              onChange={(endMonth) => setRecForm({ ...recForm, endMonth })}
            />
          </FieldSet>
        </Sheet>
      )}

      {subForm && (
        <Sheet
          open
          onClose={() => setSubForm(null)}
          onSubmit={saveSub}
          problem={subProblem}
          title={subForm.id ? t("tx.subs.edit") : t("tx.subs.new")}
          footer={
            <>
              {subForm.id && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmSubDelete(true)}>
                  {t("common.delete")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSubForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!subValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          {editingSub && !editingSub.active && (
            <Callout tone="warning" title={t("tx.subs.pausedTitle")}>
              <p>{t("tx.subs.pausedNote")}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={resumeSub}>
                <Icon name="refresh" size={14} />
                {t("tx.subs.resume")}
              </Button>
            </Callout>
          )}
          {subForm.id && (
            <p className="rounded-field bg-ghost px-3 py-2.5 text-xs leading-snug text-ink-2">
              {t("tx.subs.rewriteNote")}
            </p>
          )}
          <Field label={t("common.name")}>
            <TextInput
              value={subForm.name}
              onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
              placeholder="YouTube Premium"
            />
          </Field>
          <FieldSet label={t("common.icon")}>
            <OptionChips
              label={t("common.icon")}
              size="lg"
              options={ICON_CHOICES.map((icon) => ({ value: icon, label: icon }))}
              value={subForm.icon}
              onChange={(icon) => setSubForm({ ...subForm, icon })}
            />
          </FieldSet>
          <FieldSet label={t("tx.subs.period")}>
            <SegmentedControl
              label={t("tx.subs.period")}
              options={[
                { value: "monthly" as const, label: t("tx.subs.period.monthly") },
                { value: "yearly" as const, label: t("tx.subs.period.yearly") },
              ]}
              value={subForm.period}
              onChange={(p) => setSubForm({ ...subForm, period: p })}
            />
          </FieldSet>
          <Field
            label={subForm.period === "yearly" ? t("tx.subs.pricePerYear") : t("tx.subs.pricePerMonth")}
            hint={
              subForm.period === "yearly" && Number.isFinite(subPrice) && subPrice > 0
                ? t("tx.subs.postedAs", {
                    amount: formatMoney(subPrice / 12, subForm.currency, { exact: true }),
                  })
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
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCY_OPTIONS}
              value={subForm.currency}
              onChange={(c) => setSubForm({ ...subForm, currency: c })}
            />
          </FieldSet>
          <Field label={t("common.account")} hint={t("tx.schedule.accountHint")}>
            <OptionPicker
              label={t("common.account")}
              value={subForm.accountId}
              onChange={(accountId) => setSubForm({ ...subForm, accountId })}
              groups={optionalAccountGroups}
            />
          </Field>
          <Field label={t("tx.subs.chargeDay")} hint={t("tx.schedule.dayHint")}>
            <TextInput
              inputMode="numeric"
              value={subForm.day}
              onChange={(e) => setSubForm({ ...subForm, day: e.target.value })}
            />
          </Field>
          <FieldSet label={t("tx.subs.billingFrom")} hint={t("tx.subs.billingFrom.hint")}>
            <MonthInput
              name={t("tx.subs.billingFrom")}
              value={subForm.startMonth}
              onChange={(startMonth) => setSubForm({ ...subForm, startMonth })}
            />
          </FieldSet>
          <FieldSet label={t("tx.schedule.until")} hint={t("tx.subs.until.hint")}>
            <MonthInput
              name={t("tx.schedule.until")}
              allowEmpty
              value={subForm.endMonth}
              onChange={(endMonth) => setSubForm({ ...subForm, endMonth })}
            />
            {subForm.id && subForm.startMonth <= nowMonth && subForm.endMonth !== nowMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setSubForm({ ...subForm, endMonth: nowMonth })}
              >
                <Icon name="close" size={13} strokeWidth={2.4} />
                {t("tx.subs.endThisMonth", { month: formatMonth(nowMonth) })}
              </Button>
            )}
          </FieldSet>
        </Sheet>
      )}

      {budgetForm && (
        <Sheet
          open
          onClose={() => setBudgetForm(null)}
          onSubmit={saveBudget}
          problem={budgetProblem}
          title={budgetForm.editingId ? t("tx.budget.edit") : t("tx.budget.new")}
          footer={
            <>
              {budgetForm.editingId && (
                <Button variant="danger" className="mr-auto" onClick={() => setConfirmBudgetDelete(true)}>
                  {t("common.delete")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setBudgetForm(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!budgetValid}>
                {t("common.save")}
              </Button>
            </>
          }
        >
          <Field label={t("tx.budget.category")} hint={t("tx.budget.category.hint")}>
            <OptionPicker
              label={t("tx.budget.category")}
              value={budgetForm.categoryId}
              onChange={(categoryId) => setBudgetForm({ ...budgetForm, categoryId })}
              groups={budgetCategoryGroups}
            />
          </Field>
          <Field label={t("tx.budget.limit")}>
            <TextInput
              inputMode="decimal"
              placeholder="0"
              prefix={CURRENCY_SYMBOL[budgetForm.currency]}
              value={budgetForm.limit}
              onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })}
            />
          </Field>
          <FieldSet label={t("common.currency")}>
            <SegmentedControl
              label={t("common.currency")}
              options={CURRENCY_OPTIONS}
              value={budgetForm.currency}
              onChange={(c) => setBudgetForm({ ...budgetForm, currency: c })}
            />
          </FieldSet>
        </Sheet>
      )}

      <ConfirmDialog
        open={confirmTxDelete}
        onClose={() => setConfirmTxDelete(false)}
        onConfirm={deleteTx}
        title={t("tx.deleteTitle")}
        message={t("common.deletePermanent")}
      />
      <ConfirmDialog
        open={confirmRecDelete}
        onClose={() => setConfirmRecDelete(false)}
        onConfirm={deleteRec}
        title={t("tx.rec.deleteTitle")}
        message={tp("tx.rec.deleteMessage", postedCount("recurring", recForm?.id ?? null))}
      />
      <ConfirmDialog
        open={confirmSubDelete}
        onClose={() => setConfirmSubDelete(false)}
        onConfirm={deleteSub}
        title={t("tx.subs.deleteTitle")}
        message={tp("tx.subs.deleteMessage", postedCount("subscription", subForm?.id ?? null))}
      />
      <ConfirmDialog
        open={confirmBudgetDelete}
        onClose={() => setConfirmBudgetDelete(false)}
        onConfirm={deleteBudget}
        title={t("tx.budget.deleteTitle")}
        message={t("tx.budget.deleteMessage")}
      />
    </>
  );
}
