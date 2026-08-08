import type {
  AccountKind,
  AppState,
  Category,
  Currency,
  DebtKind,
  InvestmentKind,
  Valuation,
} from "./types";

export const ACCOUNT_KINDS: Array<{
  value: AccountKind;
  label: string;
  icon: string;
}> = [
  { value: "card", label: "Card", icon: "💳" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "savings", label: "Savings", icon: "🏦" },
  { value: "wallet", label: "E-wallet", icon: "📲" },
  { value: "other", label: "Other", icon: "📦" },
];

const ACCOUNT_KIND_BY_VALUE = new Map(ACCOUNT_KINDS.map((k) => [k.value, k]));

export function accountKind(kind: AccountKind) {
  return ACCOUNT_KIND_BY_VALUE.get(kind) ?? ACCOUNT_KINDS[0];
}

/**
 * The kinds a position can be, and what each one implies. `valuation` is the
 * load-bearing field — see the `Valuation` doc in types.ts. Ordered the way the
 * picker shows them: the two the app can actually compute first.
 */
export const INVESTMENT_KINDS: Array<{
  value: InvestmentKind;
  label: string;
  icon: string;
  valuation: Valuation;
  /** one line in the form explaining what the app will and will not do */
  hint: string;
}> = [
  {
    value: "deposit",
    label: "Deposit",
    icon: "🏦",
    valuation: "accrual",
    hint: "A bank deposit at a contracted rate — the app compounds it for you.",
  },
  {
    value: "bonds",
    label: "Bonds",
    icon: "📜",
    valuation: "accrual",
    hint: "Government or corporate bonds held at a stated yield.",
  },
  {
    value: "reit",
    label: "REIT",
    icon: "🏢",
    valuation: "market",
    hint: "Worth whatever the fund is worth today — update the value when you check it.",
  },
  {
    value: "stocks",
    label: "Stocks",
    icon: "📈",
    valuation: "market",
    hint: "Shares or an index fund — enter what the position is worth today.",
  },
  {
    value: "crypto",
    label: "Crypto",
    icon: "🪙",
    valuation: "market",
    hint: "Enter what your coins are worth today; nothing here predicts the next move.",
  },
  {
    value: "other",
    label: "Other",
    icon: "📦",
    valuation: "market",
    hint: "Anything else you hold — enter what it is worth today.",
  },
];

const KIND_BY_VALUE = new Map(INVESTMENT_KINDS.map((k) => [k.value, k]));

export function investmentKind(kind: InvestmentKind) {
  return KIND_BY_VALUE.get(kind) ?? INVESTMENT_KINDS[0];
}

/**
 * The chart slot a kind owns, shared by everything that draws it: the asset-class
 * bars in both heroes, and the icon disc on a row or a position card. One source,
 * so a REIT is the same rose wherever it appears.
 *
 * These are explicit tables rather than `index % n`. The modulo version wrapped
 * the eleventh kind back onto the first and quietly gave Cash and Crypto the
 * same colour in a chart that shows both; an explicit table cannot wrap, and it
 * makes the two families' ranges legible at a glance (see the note on
 * `--series-*` in globals.css for how the twelve were chosen and validated).
 */
const ACCOUNT_SLOT: Record<AccountKind, number> = {
  card: 1,
  cash: 2,
  savings: 3,
  wallet: 4,
  other: 5,
};

const INVESTMENT_SLOT: Record<InvestmentKind, number> = {
  deposit: 6,
  bonds: 7,
  reit: 8,
  stocks: 9,
  crypto: 10,
  other: 11,
};

/**
 * Debts reuse three slots, and may: a debt is never drawn in the same chart as
 * an asset. This trio was validated all-pairs on its own in both themes.
 */
const DEBT_SLOT: Record<DebtKind, number> = {
  mortgage: 12,
  loan: 5,
  card: 9,
};

export function accountColorSlot(kind: AccountKind): number {
  return ACCOUNT_SLOT[kind] ?? 5;
}

export function investmentColorSlot(kind: InvestmentKind): number {
  return INVESTMENT_SLOT[kind] ?? 11;
}

export function debtColorSlot(kind: DebtKind): number {
  return DEBT_SLOT[kind] ?? 12;
}

/** the Subscriptions category's slot, for rows that are all one category */
export const SUBSCRIPTION_SLOT = 8;

/** whether a position's worth is computed from a rate or simply stated */
export function valuationOf(kind: InvestmentKind): Valuation {
  return investmentKind(kind).valuation;
}

export const CURRENCIES: Currency[] = ["UAH", "USD", "EUR"];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  UAH: "₴",
  USD: "$",
  EUR: "€",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  UAH: "Hryvnia",
  USD: "US Dollar",
  EUR: "Euro",
};

/**
 * The dataset lives in Postgres; only the theme is mirrored into localStorage
 * so the pre-paint script in the root layout can apply it before hydration.
 */
export const THEME_KEY = "finance-tracker:theme";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-rent", name: "Rent", icon: "🏠", colorSlot: 1, kind: "expense" },
  { id: "cat-utilities", name: "Utilities", icon: "💡", colorSlot: 2, kind: "expense" },
  { id: "cat-food", name: "Food", icon: "🍽️", colorSlot: 3, kind: "expense" },
  { id: "cat-household", name: "Household", icon: "🧴", colorSlot: 4, kind: "expense" },
  { id: "cat-clothes", name: "Clothes", icon: "👕", colorSlot: 5, kind: "expense" },
  { id: "cat-wants", name: "Fun & Wants", icon: "🎮", colorSlot: 6, kind: "expense" },
  { id: "cat-unexpected", name: "Unexpected", icon: "⚡", colorSlot: 7, kind: "expense" },
  { id: "cat-subs", name: "Subscriptions", icon: "📱", colorSlot: 8, kind: "expense" },
  { id: "cat-transport", name: "Transport", icon: "🚗", colorSlot: 1, kind: "expense" },
  { id: "cat-health", name: "Health", icon: "💊", colorSlot: 2, kind: "expense" },
  { id: "cat-education", name: "Education", icon: "📚", colorSlot: 4, kind: "expense" },
  { id: "cat-gifts-out", name: "Gifts", icon: "🎁", colorSlot: 7, kind: "expense" },
  { id: "cat-other-exp", name: "Other", icon: "📦", colorSlot: 3, kind: "expense" },
  { id: "cat-salary", name: "Salary", icon: "💼", colorSlot: 2, kind: "income" },
  { id: "cat-freelance", name: "Freelance", icon: "🧑‍💻", colorSlot: 1, kind: "income" },
  { id: "cat-interest", name: "Interest", icon: "🏦", colorSlot: 5, kind: "income" },
  { id: "cat-dividends", name: "Dividends", icon: "📈", colorSlot: 4, kind: "income" },
  { id: "cat-sale", name: "Sale", icon: "🏷️", colorSlot: 8, kind: "income" },
  { id: "cat-gifts-in", name: "Gifts", icon: "🎁", colorSlot: 7, kind: "income" },
  { id: "cat-other-inc", name: "Other", icon: "💰", colorSlot: 3, kind: "income" },
];

/** fallback rates (UAH per 1 unit), editable in settings or fetched from Monobank/NBU */
export const DEFAULT_RATES = { USD: 44.6, EUR: 50.8 };

/** default ФОП tax: 5% single tax + 1% military levy, plus the fixed ЄСВ deduction */
export const DEFAULT_TAX = { ratePct: 6, fixedUAH: 1902.34 };

export const DEFAULT_STATE: AppState = {
  version: 1,
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  recurring: [],
  subscriptions: [],
  savings: [],
  investments: [],
  budgets: [],
  debts: [],
  settings: {
    baseCurrency: "UAH",
    theme: "dark",
    tax: DEFAULT_TAX,
    rates: DEFAULT_RATES,
    ratesSource: "manual",
  },
};

/** icons offered when creating savings accounts / categories / subscriptions */
export const ICON_CHOICES = [
  "💵", "🏦", "💳", "🐷", "🧧", "🏠", "🚗", "✈️", "🎓", "💍",
  "🛒", "🍽️", "💊", "🎬", "👕", "📱", "📚", "🎁", "📦", "💰",
  "🧑‍💻", "💼", "⚡", "🌊", "🛡️", "🎯", "🎮", "🎵", "☁️", "🤖",
];
