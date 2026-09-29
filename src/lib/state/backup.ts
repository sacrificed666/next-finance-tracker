import { DEFAULT_STATE, valuationOf } from "@/lib/constants";
import { BANKABLE_KINDS, BRANDS } from "@/lib/catalog/brands";
import { COINS } from "@/lib/market/crypto";
import { CUSTOM_GAME_ID, GAMES } from "@/lib/catalog/games";
import { INZHUR_FUNDS } from "@/lib/market/inzhur";
import { returnPolicy } from "@/lib/finance/returns";
import { LOCALES } from "@/lib/i18n/locales";
import { DEFAULT_TAX_PROFILE, taxRegime, TAX_REGIMES } from "@/lib/finance/tax";
import { normalizeMonthRates } from "@/lib/finance/month-rates";
import { normalizeDashboard } from "./dashboard";
import type {
  AppState,
  Budget,
  Category,
  CategoryRule,
  CoinHolding,
  Currency,
  Debt,
  IncomeBreakdown,
  Investment,
  Locale,
  NetWorthSnapshot,
  PlannedEvent,
  Receivable,
  RecurringRule,
  SavingsAccount,
  Settings,
  Subscription,
  TaxProfile,
  TaxRegimeId,
  Transaction,
  WishItem,
  WishPriority,
} from "@/lib/types";

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

export function normalizeState(raw: unknown): AppState {
  if (!isRecord(raw)) return DEFAULT_STATE;

  const rawTransactions = migrateLegacyIncomeEntries(
    asArray(raw.transactions).filter(isTransaction).map(normalizeTransaction),
    raw.incomeEntries,
  );
  const categories = normalizeCategoryTree(
    asArray(raw.categories).filter(isCategory).map(translateLegacyCategory),
  );
  const recurring = asArray(raw.recurring).filter(isRecurring);
  const rawSubscriptions = asArray(raw.subscriptions)
    .filter(isSubscription)
    .map((s): Subscription => ({
      ...s,
      period: s.period === "yearly" ? "yearly" : "monthly",
    }));
  const { transactions, subscriptions } = migrateYearlySubscriptions(
    rawTransactions,
    rawSubscriptions,
  );
  const savings = asArray(raw.savings).filter(isSavings).map(normalizeAccount);
  const investments = asArray(raw.investments).filter(isInvestment).map(normalizeInvestment);
  const budgets = asArray(raw.budgets)
    .filter(isBudget)
    .map((b): Budget => ({ categoryId: b.categoryId, limit: b.limit, currency: b.currency, rollover: b.rollover === true || undefined }));
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
    rules: normalizeRules(raw.rules),
    receivables: normalizeReceivables(raw.receivables),
    wishlist: normalizeWishlist(raw.wishlist),
    plannedEvents: normalizePlannedEvents(raw.plannedEvents),
    snapshots: normalizeSnapshots(raw.snapshots),
    settings: {
      baseCurrency: isCurrency(s.baseCurrency) ? s.baseCurrency : "UAH",
      theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
      locale: isLocale(s.locale) ? s.locale : DEFAULT_STATE.settings.locale,
      tax: normalizeTaxProfile(tax),
      rates: {
        USD: isFiniteNumber(rates.USD) && rates.USD > 0 ? rates.USD : DEFAULT_STATE.settings.rates.USD,
        EUR: isFiniteNumber(rates.EUR) && rates.EUR > 0 ? rates.EUR : DEFAULT_STATE.settings.rates.EUR,
      },
      ratesMeta: isRatesMeta(s.ratesMeta) ? s.ratesMeta : undefined,
      ratesUpdatedAt: typeof s.ratesUpdatedAt === "string" ? s.ratesUpdatedAt : undefined,
      ratesSource:
        s.ratesSource === "nbu" || s.ratesSource === "monobank" ? s.ratesSource : "manual",
      taxPaid: normalizeTaxPaid(s.taxPaid),
      bankLinks: normalizeBankLinks(s.bankLinks),
      dashboard: normalizeDashboard(s.dashboard),
      monthRates: normalizeMonthRates(s.monthRates),
      notify: normalizeNotify(s.notify),
    },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const text = v.trim().slice(0, max);
  return text.length > 0 ? text : undefined;
}

function normalizeNotify(v: unknown): Settings["notify"] {
  if (!isRecord(v)) return undefined;
  const operations = v.operations === false ? false : undefined;
  const budgets = v.budgets === false ? false : undefined;
  return operations === undefined && budgets === undefined ? undefined : { operations, budgets };
}

export function normalizeTags(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    const tag = cleanText(raw, 24)?.replace(/^#/, "");
    if (!tag || seen.has(tag.toLocaleLowerCase())) continue;
    seen.add(tag.toLocaleLowerCase());
    out.push(tag);
    if (out.length === 8) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeRules(v: unknown): CategoryRule[] {
  return asArray(v).flatMap((r) => {
    if (!isRecord(r) || !isNonEmptyString(r.id) || !isNonEmptyString(r.categoryId)) return [];
    const match = cleanText(r.match, 80);
    if (!match) return [];
    return [{ id: r.id, match, categoryId: r.categoryId, type: r.type === "income" ? "income" : "expense" }];
  });
}

function normalizeReceivables(v: unknown): Receivable[] {
  return asArray(v).flatMap((r) => {
    if (!isRecord(r) || !isNonEmptyString(r.id) || !isCurrency(r.currency)) return [];
    const name = cleanText(r.name, 80);
    if (!name || !isFiniteNumber(r.amount) || r.amount <= 0) return [];
    const date = typeof r.date === "string" && DATE_RE.test(r.date) ? r.date : undefined;
    if (!date) return [];
    const repaid = isFiniteNumber(r.repaid) ? Math.min(Math.max(0, r.repaid), r.amount) : 0;
    return [
      {
        id: r.id,
        name,
        icon: typeof r.icon === "string" ? r.icon.slice(0, 16) : "🤝",
        amount: r.amount,
        currency: r.currency,
        date,
        dueDate: typeof r.dueDate === "string" && DATE_RE.test(r.dueDate) ? r.dueDate : undefined,
        repaid,
        note: cleanText(r.note, 300),
      },
    ];
  });
}

const PRIORITIES = new Set<WishPriority>(["high", "normal", "low"]);

function normalizeWishlist(v: unknown): WishItem[] {
  return asArray(v).flatMap((w) => {
    if (!isRecord(w) || !isNonEmptyString(w.id) || !isCurrency(w.currency)) return [];
    const name = cleanText(w.name, 80);
    if (!name || !isFiniteNumber(w.price) || w.price <= 0) return [];
    return [
      {
        id: w.id,
        name,
        icon: typeof w.icon === "string" ? w.icon.slice(0, 16) : "🎁",
        price: w.price,
        currency: w.currency,
        priority: PRIORITIES.has(w.priority as WishPriority) ? (w.priority as WishPriority) : "normal",
        url: typeof w.url === "string" && HTTPS_URL_RE.test(w.url) ? w.url : undefined,
        note: cleanText(w.note, 300),
        month: typeof w.month === "string" && MONTH_RE.test(w.month) ? w.month : undefined,
        createdAt: typeof w.createdAt === "string" && DATE_RE.test(w.createdAt) ? w.createdAt : new Date().toISOString().slice(0, 10),
      },
    ];
  });
}

function normalizePlannedEvents(v: unknown): PlannedEvent[] {
  return asArray(v).flatMap((e) => {
    if (!isRecord(e) || !isNonEmptyString(e.id) || !isCurrency(e.currency)) return [];
    if (typeof e.month !== "string" || !MONTH_RE.test(e.month) || !isFiniteNumber(e.amount) || e.amount === 0) return [];
    return [{ id: e.id, month: e.month, amount: e.amount, currency: e.currency, note: cleanText(e.note, 120) ?? "" }];
  });
}

function normalizeSnapshots(v: unknown): NetWorthSnapshot[] {
  const byDate = new Map<string, NetWorthSnapshot>();
  for (const s of asArray(v)) {
    if (!isRecord(s) || typeof s.date !== "string" || !DATE_RE.test(s.date)) continue;
    const nums = [s.total, s.savings, s.investments, s.debts, s.receivables ?? 0];
    if (!nums.every(isFiniteNumber)) continue;
    const rates = isRecord(s.rates) ? s.rates : {};
    byDate.set(s.date, {
      date: s.date,
      total: s.total as number,
      savings: s.savings as number,
      investments: s.investments as number,
      debts: s.debts as number,
      receivables: (s.receivables as number | undefined) ?? 0,
      rates: {
        USD: isFiniteNumber(rates.USD) && rates.USD > 0 ? rates.USD : DEFAULT_STATE.settings.rates.USD,
        EUR: isFiniteNumber(rates.EUR) && rates.EUR > 0 ? rates.EUR : DEFAULT_STATE.settings.rates.EUR,
      },
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeBankLinks(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [bankId, accountId] of Object.entries(v)) {
    if (/^[\w-]{1,80}$/.test(bankId) && typeof accountId === "string" && accountId.length <= 80) out[bankId] = accountId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeTaxPaid(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, date] of Object.entries(v)) {
    if (key.length <= 60 && typeof date === "string" && DATE_RE.test(date)) out[key] = date;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

const LOCALE_SET = new Set<string>(LOCALES.map((l) => l.code));

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && LOCALE_SET.has(v);
}

const REGIME_SET = new Set<string>(TAX_REGIMES.map((r) => r.id));

function isRegime(v: unknown): v is TaxRegimeId {
  return typeof v === "string" && REGIME_SET.has(v);
}

function normalizeTaxProfile(tax: Record<string, unknown>): TaxProfile {
  const regimeId: TaxRegimeId = isRegime(tax.regime)
    ? tax.regime
    : isFiniteNumber(tax.ratePct) &&
        (tax.ratePct !== DEFAULT_TAX_PROFILE.ratePct ||
          tax.fixedUAH !== DEFAULT_TAX_PROFILE.fixedUAH)
      ? "custom"
      : DEFAULT_TAX_PROFILE.regime;
  const regime = taxRegime(regimeId);
  if (!regime.editable) {
    return {
      regime: regimeId,
      ratePct: regime.ratePct,
      fixedUAH: regime.fixedUAH,
      vatPct: regime.vatPct,
      label: "",
    };
  }
  return {
    regime: regimeId,
    ratePct:
      isFiniteNumber(tax.ratePct) && tax.ratePct >= 0 && tax.ratePct < 100
        ? tax.ratePct
        : regime.ratePct,
    fixedUAH:
      isFiniteNumber(tax.fixedUAH) && tax.fixedUAH >= 0 ? tax.fixedUAH : regime.fixedUAH,
    vatPct:
      isFiniteNumber(tax.vatPct) && tax.vatPct >= 0 && tax.vatPct < 100 ? tax.vatPct : 0,
    label: typeof tax.label === "string" ? tax.label.slice(0, 60) : "",
  };
}

function normalizeCategoryTree(categories: Category[]): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return categories.map((c) => {
    if (!c.parentId) return c;
    const parent = byId.get(c.parentId);
    const valid =
      parent !== undefined &&
      parent.id !== c.id &&
      parent.kind === c.kind &&
      !parent.parentId;
    if (valid) return c;
    const { parentId: _drop, ...rest } = c;
    void _drop;
    return rest;
  });
}

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
    v.gross > 0 &&
    (v.regime === undefined || isRegime(v.regime)) &&
    (v.vatPct === undefined || (isFiniteNumber(v.vatPct) && v.vatPct >= 0 && v.vatPct < 100)) &&
    (v.label === undefined || typeof v.label === "string")
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

function normalizeBankLine(v: unknown): Transaction["bank"] {
  if (!isRecord(v)) return undefined;
  const time = isFiniteNumber(v.time) && v.time > 0 ? Math.round(v.time) : undefined;
  const opCurrency = isCurrency(v.opCurrency) ? v.opCurrency : undefined;
  const opAmount = opCurrency && isFiniteNumber(v.opAmount) && v.opAmount >= 0 ? v.opAmount : undefined;
  if (time === undefined && opAmount === undefined) return undefined;
  const line: NonNullable<Transaction["bank"]> = {};
  if (time !== undefined) line.time = time;
  if (opAmount !== undefined) {
    line.opAmount = opAmount;
    line.opCurrency = opCurrency;
  }
  return line;
}

function normalizeTransaction(raw: Transaction): Transaction {
  const t: Transaction = {
    ...raw,
    tags: normalizeTags(raw.tags),
    externalId: cleanText(raw.externalId, 120),
    bank: normalizeBankLine((raw as { bank?: unknown }).bank),
    splitId: cleanText(raw.splitId, 60),
    attachmentIds: Array.isArray(raw.attachmentIds)
      ? raw.attachmentIds.filter((id): id is string => typeof id === "string" && /^[\w-]{1,60}$/.test(id)).slice(0, 10)
      : undefined,
  };
  if (!t.attachmentIds?.length) delete t.attachmentIds;
  for (const key of ["tags", "externalId", "bank", "splitId"] as const) if (t[key] === undefined) delete t[key];
  if (t.type !== "transfer") {
    const { toAccountId: _to, toAmount: _amount, ...rest } = t;
    void _to;
    void _amount;
    return { ...rest, categoryId: t.categoryId ?? "" };
  }
  return {
    ...t,
    categoryId: "",
    toAmount: t.toAmount ?? t.amount,
    breakdown: undefined,
    tax: undefined,
  };
}

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
    (v.kind === "income" || v.kind === "expense") &&
    (v.parentId === undefined || isNonEmptyString(v.parentId))
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
    (v.period === undefined || v.period === "monthly" || v.period === "yearly") &&
    isFiniteNumber(v.dayOfMonth) &&
    typeof v.startMonth === "string" &&
    /^\d{4}-\d{2}$/.test(v.startMonth) &&
    (v.endMonth === undefined ||
      (typeof v.endMonth === "string" && /^\d{4}-\d{2}$/.test(v.endMonth))) &&
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

const ACCOUNT_KIND_SET = new Set(["card", "cash", "savings", "wallet", "crypto", "skins", "other"]);
const GAME_ID_SET = new Set([...GAMES.map((g) => g.id), CUSTOM_GAME_ID]);
const BANK_ID_SET = new Set(BRANDS.map((b) => b.id));
const HTTPS_URL_RE = /^https:\/\/[^\s"<>]{3,480}$/;

const COIN_ICON_RE = /^https:\/\/[\w.-]*coingecko\.com\//;
const COIN_ID_SET = new Set(COINS.map((c) => c.id));

function normalizeHoldings(raw: unknown): CoinHolding[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: CoinHolding[] = [];
  for (const h of raw) {
    if (!isRecord(h) || typeof h.coin !== "string" || !COIN_ID_SET.has(h.coin) || seen.has(h.coin)) continue;
    if (!isFiniteNumber(h.quantity) || h.quantity < 0) continue;
    seen.add(h.coin);
    out.push({
      coin: h.coin,
      quantity: h.quantity,
      price: isFiniteNumber(h.price) && h.price > 0 ? h.price : undefined,
      icon: typeof h.icon === "string" && COIN_ICON_RE.test(h.icon) ? h.icon : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeAccount(v: SavingsAccount): SavingsAccount {
  const legacy = (v as unknown as { balance?: number }).balance;
  const opening = isFiniteNumber(v.openingBalance)
    ? v.openingBalance
    : isFiniteNumber(legacy)
      ? legacy
      : 0;
  const kind = ACCOUNT_KIND_SET.has(v.kind as string) ? v.kind : "card";
  const game =
    kind === "skins" && typeof v.game === "string" && GAME_ID_SET.has(v.game)
      ? v.game
      : undefined;
  const custom = game === CUSTOM_GAME_ID;
  const gameName =
    custom && typeof v.gameName === "string" && v.gameName.trim()
      ? v.gameName.trim().slice(0, 60)
      : undefined;
  return {
    id: v.id,
    name: v.name,
    icon: v.icon,
    kind,
    game: custom && !gameName ? undefined : game,
    gameName,
    gameLogo:
      custom && gameName && typeof v.gameLogo === "string" && HTTPS_URL_RE.test(v.gameLogo)
        ? v.gameLogo
        : undefined,
    bank:
      BANKABLE_KINDS.has(kind) && typeof v.bank === "string" && BANK_ID_SET.has(v.bank)
        ? v.bank
        : undefined,
    currency: v.currency,
    openingBalance: opening,
    holdings: kind === "crypto" ? normalizeHoldings(v.holdings) : undefined,
    pricedAt: kind === "crypto" && typeof v.pricedAt === "string" ? v.pricedAt : undefined,
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

const INVESTMENT_KIND_SET = new Set([
  "deposit", "bonds", "reit", "inzhur", "stocks", "crypto", "other",
]);

const INZHUR_FUND_SET = new Set(INZHUR_FUNDS.map((f) => f.id));

function normalizeInvestment(v: Investment): Investment {
  const kind: Investment["kind"] =
    typeof v.kind === "string" && INVESTMENT_KIND_SET.has(v.kind) ? v.kind : "deposit";
  const market = valuationOf(kind) === "market";
  const fund =
    kind === "inzhur" && typeof v.fund === "string" && INZHUR_FUND_SET.has(v.fund) ? v.fund : undefined;
  const policy = returnPolicy({ kind, fund, compounding: v.compounding, compoundingFreq: v.compoundingFreq });
  return {
    ...v,
    compounding: policy.compounding,
    compoundingFreq: policy.compoundingFreq,
    kind,
    annualRatePct:
      isFiniteNumber(v.annualRatePct) && v.annualRatePct >= 0 && v.annualRatePct <= 200
        ? v.annualRatePct
        : 0,
    marketValue: market
      ? isFiniteNumber(v.marketValue) && v.marketValue >= 0
        ? v.marketValue
        : v.principal
      : undefined,
    coin: kind === "crypto" && isNonEmptyString(v.coin) ? v.coin : undefined,
    fund,
    quantity:
      (kind === "crypto" || kind === "inzhur") && isFiniteNumber(v.quantity) && v.quantity >= 0
        ? v.quantity
        : undefined,
    pricedAt:
      (kind === "crypto" || kind === "inzhur") && typeof v.pricedAt === "string"
        ? v.pricedAt
        : undefined,
    coinIcon:
      kind === "crypto" && typeof v.coinIcon === "string" && COIN_ICON_RE.test(v.coinIcon)
        ? v.coinIcon
        : undefined,
  };
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

export function exportBackup(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

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
