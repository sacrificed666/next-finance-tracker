import { DEFAULT_STATE } from "./constants";
import type {
  AppState,
  Budget,
  Category,
  Currency,
  Debt,
  IncomeBreakdown,
  Investment,
  RecurringRule,
  SavingsAccount,
  Subscription,
  Transaction,
} from "./types";

const CURRENCY_SET = new Set(["UAH", "USD", "EUR"]);

function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && CURRENCY_SET.has(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerce arbitrary parsed JSON into a valid AppState: keep well-formed
 * entries, drop the rest, fall back to defaults for missing sections.
 * Used both for localStorage loads and user-imported backups.
 */
export function normalizeState(raw: unknown): AppState {
  if (!isRecord(raw)) return DEFAULT_STATE;

  const rawTransactions = migrateLegacyIncomeEntries(
    asArray(raw.transactions).filter(isTransaction).map(normalizeTransaction),
    raw.incomeEntries,
  );
  const categories = asArray(raw.categories)
    .filter(isCategory)
    .map(translateLegacyCategory);
  const recurring = asArray(raw.recurring).filter(isRecurring);
  const rawSubscriptions = asArray(raw.subscriptions)
    .filter(isSubscription)
    .map((s): Subscription => ({
      ...s,
      period: s.period === "yearly" ? "yearly" : "monthly",
    }));
  // amortize any yearly subscription still stored as a single lump-sum charge
  const { transactions, subscriptions } = migrateYearlySubscriptions(
    rawTransactions,
    rawSubscriptions,
  );
  const savings = asArray(raw.savings).filter(isSavings).map(normalizeAccount);
  const investments = asArray(raw.investments).filter(isInvestment);
  const budgets = asArray(raw.budgets).filter(isBudget);
  const debts = asArray(raw.debts).filter(isDebt).map(normalizeDebt);

  const s = isRecord(raw.settings) ? raw.settings : {};
  const rates = isRecord(s.rates) ? s.rates : {};
  const tax = isRecord(s.tax) ? s.tax : {};

  return {
    version: 1,
    transactions,
    categories: categories.length > 0 ? categories : DEFAULT_STATE.categories,
    recurring,
    subscriptions,
    savings,
    investments,
    budgets,
    debts,
    settings: {
      baseCurrency: isCurrency(s.baseCurrency) ? s.baseCurrency : "UAH",
      theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
      tax: {
        ratePct:
          isFiniteNumber(tax.ratePct) && tax.ratePct >= 0 && tax.ratePct < 100
            ? tax.ratePct
            : DEFAULT_STATE.settings.tax.ratePct,
        fixedUAH:
          isFiniteNumber(tax.fixedUAH) && tax.fixedUAH >= 0
            ? tax.fixedUAH
            : DEFAULT_STATE.settings.tax.fixedUAH,
      },
      rates: {
        USD: isFiniteNumber(rates.USD) && rates.USD > 0 ? rates.USD : DEFAULT_STATE.settings.rates.USD,
        EUR: isFiniteNumber(rates.EUR) && rates.EUR > 0 ? rates.EUR : DEFAULT_STATE.settings.rates.EUR,
      },
      ratesMeta: isRatesMeta(s.ratesMeta) ? s.ratesMeta : undefined,
      ratesUpdatedAt: typeof s.ratesUpdatedAt === "string" ? s.ratesUpdatedAt : undefined,
      ratesSource:
        s.ratesSource === "nbu" || s.ratesSource === "monobank" ? s.ratesSource : "manual",
    },
  };
}

function isBuySell(v: unknown): v is { buy: number; sell: number } {
  return (
    isRecord(v) &&
    isFiniteNumber(v.buy) &&
    v.buy > 0 &&
    isFiniteNumber(v.sell) &&
    v.sell > 0
  );
}

function isRatesMeta(
  v: unknown,
): v is NonNullable<AppState["settings"]["ratesMeta"]> {
  return (
    isRecord(v) &&
    (v.USD === undefined || isBuySell(v.USD)) &&
    (v.EUR === undefined || isBuySell(v.EUR))
  );
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * The first release shipped Ukrainian default category names; they live on
 * inside users' localStorage. Translate a stored category to English only
 * when it is an untouched legacy default (same id, same original name) —
 * user-renamed categories are left alone.
 */
const LEGACY_CATEGORY_NAMES: Record<string, { uk: string; en: string }> = {
  "cat-groceries": { uk: "Продукти", en: "Groceries" },
  "cat-cafe": { uk: "Кафе й ресторани", en: "Cafes & Restaurants" },
  "cat-transport": { uk: "Транспорт", en: "Transport" },
  "cat-housing": { uk: "Житло й комуналка", en: "Housing & Utilities" },
  "cat-health": { uk: "Здоровʼя", en: "Health" },
  "cat-fun": { uk: "Розваги", en: "Entertainment" },
  "cat-clothes": { uk: "Одяг", en: "Clothes" },
  "cat-subs": { uk: "Підписки", en: "Subscriptions" },
  "cat-education": { uk: "Освіта", en: "Education" },
  "cat-gifts-out": { uk: "Подарунки", en: "Gifts" },
  "cat-other-exp": { uk: "Інше", en: "Other" },
  "cat-salary": { uk: "Зарплата", en: "Salary" },
  "cat-freelance": { uk: "Фриланс", en: "Freelance" },
  "cat-interest": { uk: "Відсотки", en: "Interest" },
  "cat-gifts-in": { uk: "Подарунки", en: "Gifts" },
  "cat-other-inc": { uk: "Інше", en: "Other" },
};

function translateLegacyCategory(cat: Category): Category {
  const legacy = LEGACY_CATEGORY_NAMES[cat.id];
  return legacy && cat.name === legacy.uk ? { ...cat, name: legacy.en } : cat;
}

function isIncomeBreakdown(v: unknown): v is IncomeBreakdown {
  return (
    isRecord(v) &&
    isFiniteNumber(v.days) &&
    v.days >= 0 &&
    isFiniteNumber(v.dailyRate) &&
    v.dailyRate >= 0 &&
    isFiniteNumber(v.premium) &&
    isFiniteNumber(v.compensations) &&
    isFiniteNumber(v.cutoffs)
  );
}

function isIncomeTax(v: unknown): v is NonNullable<Transaction["tax"]> {
  return (
    isRecord(v) &&
    isFiniteNumber(v.ratePct) &&
    v.ratePct >= 0 &&
    isFiniteNumber(v.fixedUAH) &&
    v.fixedUAH >= 0 &&
    isFiniteNumber(v.gross) &&
    v.gross > 0
  );
}

function isTransaction(v: unknown): v is Transaction {
  if (!isRecord(v)) return false;
  const isTransfer = v.type === "transfer";
  return (
    isNonEmptyString(v.id) &&
    (v.type === "income" || v.type === "expense" || isTransfer) &&
    isFiniteNumber(v.amount) &&
    v.amount > 0 &&
    isCurrency(v.currency) &&
    // a transfer carries no category but must name both ends
    (isTransfer
      ? isNonEmptyString(v.accountId) &&
        isNonEmptyString(v.toAccountId) &&
        v.accountId !== v.toAccountId
      : isNonEmptyString(v.categoryId)) &&
    typeof v.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
    (v.accountId === undefined || isNonEmptyString(v.accountId)) &&
    (v.toAccountId === undefined || isNonEmptyString(v.toAccountId)) &&
    (v.toAmount === undefined || (isFiniteNumber(v.toAmount) && v.toAmount > 0)) &&
    (v.breakdown === undefined || isIncomeBreakdown(v.breakdown)) &&
    (v.tax === undefined || isIncomeTax(v.tax))
  );
}

/**
 * Fills the gaps the shape allows: transfers carry no category (the column is
 * NOT NULL, so it becomes ""), and transfer-only fields are stripped from
 * income/expense rows so a type change cannot leave a stale destination.
 */
function normalizeTransaction(t: Transaction): Transaction {
  if (t.type !== "transfer") {
    const { toAccountId: _to, toAmount: _amount, ...rest } = t;
    void _to;
    void _amount;
    return { ...rest, categoryId: t.categoryId ?? "" };
  }
  return {
    ...t,
    categoryId: "",
    // same-currency transfers arrive untouched
    toAmount: t.toAmount ?? t.amount,
    breakdown: undefined,
    tax: undefined,
  };
}

/**
 * Legacy releases stored contract-work income as a separate `incomeEntries`
 * array, each linked to an income transaction. The transactions already
 * carry the correct amounts; here we re-attach the day-rate breakdown so
 * editing an old contract month reopens the calculator. The entries array
 * itself is then dropped.
 */
function migrateLegacyIncomeEntries(
  transactions: Transaction[],
  rawEntries: unknown,
): Transaction[] {
  const entries = asArray(rawEntries);
  if (entries.length === 0) return transactions;
  const byTxId = new Map<string, IncomeBreakdown>();
  for (const e of entries) {
    if (!isRecord(e) || !isNonEmptyString(e.transactionId)) continue;
    if (isIncomeBreakdown(e)) {
      byTxId.set(e.transactionId, {
        days: e.days,
        dailyRate: e.dailyRate,
        premium: e.premium,
        compensations: e.compensations,
        cutoffs: e.cutoffs,
      });
    }
  }
  if (byTxId.size === 0) return transactions;
  return transactions.map((t) =>
    t.breakdown == null && byTxId.has(t.id)
      ? { ...t, breakdown: byTxId.get(t.id) }
      : t,
  );
}

function isCategory(v: unknown): v is Category {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    isNonEmptyString(v.name) &&
    typeof v.icon === "string" &&
    isFiniteNumber(v.colorSlot) &&
    (v.kind === "income" || v.kind === "expense")
  );
}

function isRecurring(v: unknown): v is RecurringRule {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    (v.type === "income" || v.type === "expense") &&
    isFiniteNumber(v.amount) &&
    v.amount > 0 &&
    isCurrency(v.currency) &&
    isNonEmptyString(v.categoryId) &&
    isFiniteNumber(v.dayOfMonth) &&
    typeof v.startMonth === "string" &&
    /^\d{4}-\d{2}$/.test(v.startMonth)
  );
}

/**
 * Yearly subscriptions used to post one full-price charge a year; they are
 * now amortized into twelve monthly slices (price/12). Detect the old
 * lump-sum postings, drop the sub's generated transactions and clear its
 * lastAppliedMonth so the store re-materializes it spread across the months.
 * Idempotent: already-spread subs (amount ≈ price/12) are left untouched.
 */
function migrateYearlySubscriptions(
  transactions: Transaction[],
  subscriptions: Subscription[],
): { transactions: Transaction[]; subscriptions: Subscription[] } {
  const resetIds = new Set<string>();
  for (const sub of subscriptions) {
    if (sub.period !== "yearly" || sub.price <= 0) continue;
    const posts = transactions.filter((t) => t.subscriptionId === sub.id);
    const monthly = sub.price / 12;
    if (posts.some((t) => Math.abs(t.amount - monthly) > sub.price * 0.02)) {
      resetIds.add(sub.id);
    }
  }
  if (resetIds.size === 0) return { transactions, subscriptions };
  return {
    transactions: transactions.filter(
      (t) => !(t.subscriptionId && resetIds.has(t.subscriptionId)),
    ),
    subscriptions: subscriptions.map((s) =>
      resetIds.has(s.id) ? { ...s, lastAppliedMonth: undefined } : s,
    ),
  };
}

function isSubscription(v: unknown): v is Subscription {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    isNonEmptyString(v.name) &&
    typeof v.icon === "string" &&
    isFiniteNumber(v.price) &&
    v.price > 0 &&
    isCurrency(v.currency) &&
    // legacy subs have no `period`; normalizeState defaults it to "monthly"
    (v.period === undefined || v.period === "monthly" || v.period === "yearly") &&
    isFiniteNumber(v.dayOfMonth) &&
    typeof v.startMonth === "string" &&
    /^\d{4}-\d{2}$/.test(v.startMonth) &&
    typeof v.active === "boolean"
  );
}

function isGoal(v: unknown): v is NonNullable<SavingsAccount["goal"]> {
  return (
    isRecord(v) &&
    isFiniteNumber(v.target) &&
    v.target > 0 &&
    (v.deadline === undefined || typeof v.deadline === "string")
  );
}

/**
 * Accepts both shapes: `openingBalance` (current) and the pre-accounts
 * `balance` (legacy backups and databases), which `normalizeState` then
 * carries over as the opening balance.
 */
function isSavings(v: unknown): v is SavingsAccount {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    isNonEmptyString(v.name) &&
    typeof v.icon === "string" &&
    isCurrency(v.currency) &&
    (isFiniteNumber(v.openingBalance) || isFiniteNumber(v.balance)) &&
    (v.goal === undefined || isGoal(v.goal))
  );
}

/** legacy `balance` → `openingBalance`; balances are derived from transactions now */
function normalizeAccount(v: SavingsAccount): SavingsAccount {
  const legacy = (v as unknown as { balance?: number }).balance;
  const opening = isFiniteNumber(v.openingBalance)
    ? v.openingBalance
    : isFiniteNumber(legacy)
      ? legacy
      : 0;
  return {
    id: v.id,
    name: v.name,
    icon: v.icon,
    currency: v.currency,
    openingBalance: opening,
    goal: v.goal,
  };
}

function isInvestment(v: unknown): v is Investment {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    isNonEmptyString(v.name) &&
    isCurrency(v.currency) &&
    isFiniteNumber(v.principal) &&
    v.principal > 0 &&
    isFiniteNumber(v.annualRatePct) &&
    v.annualRatePct >= 0 &&
    v.annualRatePct <= 200 &&
    typeof v.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.startDate) &&
    // maturity is optional, but when present it has to come after the start —
    // a position that ended before it began would freeze at its principal
    (v.endDate === undefined ||
      (typeof v.endDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(v.endDate) &&
        v.endDate >= v.startDate)) &&
    (v.compounding === "reinvest" || v.compounding === "payout") &&
    (v.compoundingFreq === "monthly" ||
      v.compoundingFreq === "quarterly" ||
      v.compoundingFreq === "annually") &&
    (v.monthlyContribution === undefined ||
      (isFiniteNumber(v.monthlyContribution) && v.monthlyContribution >= 0))
  );
}

function isBudget(v: unknown): v is Budget {
  return (
    isRecord(v) &&
    isNonEmptyString(v.categoryId) &&
    isFiniteNumber(v.limit) &&
    v.limit > 0 &&
    isCurrency(v.currency)
  );
}

function isDebt(v: unknown): v is Debt {
  return (
    isRecord(v) &&
    isNonEmptyString(v.id) &&
    isNonEmptyString(v.name) &&
    typeof v.icon === "string" &&
    (v.kind === "mortgage" || v.kind === "loan" || v.kind === "card") &&
    isCurrency(v.currency) &&
    isFiniteNumber(v.balance) &&
    v.balance >= 0 &&
    (v.principal === undefined || (isFiniteNumber(v.principal) && v.principal >= 0)) &&
    (v.annualRatePct === undefined ||
      (isFiniteNumber(v.annualRatePct) && v.annualRatePct >= 0 && v.annualRatePct <= 200)) &&
    (v.monthlyPayment === undefined ||
      (isFiniteNumber(v.monthlyPayment) && v.monthlyPayment >= 0))
  );
}

/** strip optional fields down to their meaningful values (0/empty → absent) */
function normalizeDebt(v: Debt): Debt {
  return {
    id: v.id,
    name: v.name,
    icon: v.icon,
    kind: v.kind,
    currency: v.currency,
    balance: v.balance,
    principal: v.principal && v.principal > 0 ? v.principal : undefined,
    annualRatePct: v.annualRatePct && v.annualRatePct > 0 ? v.annualRatePct : undefined,
    monthlyPayment: v.monthlyPayment && v.monthlyPayment > 0 ? v.monthlyPayment : undefined,
    note: v.note?.trim() ? v.note : undefined,
  };
}

/** serialize state for a downloadable backup file */
export function exportBackup(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** parse an uploaded backup; throws with a human message when unusable */
export function parseBackup(text: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  if (!isRecord(raw) || !("version" in raw)) {
    throw new Error("The file does not look like a backup of this app.");
  }
  return normalizeState(raw);
}
