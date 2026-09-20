import { DEFAULT_TAX_PROFILE } from "./tax";
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
  { value: "crypto", label: "Crypto", icon: "🪙" },
  { value: "skins", label: "Game Skins", icon: "🎮" },
  { value: "other", label: "Other", icon: "📦" },
];

const ACCOUNT_KIND_BY_VALUE = new Map(ACCOUNT_KINDS.map((k) => [k.value, k]));

export function accountKind(kind: AccountKind) {
  return ACCOUNT_KIND_BY_VALUE.get(kind) ?? ACCOUNT_KINDS[0];
}

export const INVESTMENT_KINDS: Array<{
  value: InvestmentKind;
  label: string;
  icon: string;
  valuation: Valuation;
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
    value: "inzhur",
    label: "Inzhur",
    icon: "🏛️",
    valuation: "market",
    hint: "Certificates of an Inzhur fund — priced from the fund's published NAV.",
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

const ACCOUNT_SLOT: Record<AccountKind, number> = {
  card: 1,
  cash: 2,
  savings: 3,
  wallet: 4,
  other: 5,
  skins: 6,
  crypto: 11,
};

const INVESTMENT_SLOT: Record<InvestmentKind, number> = {
  deposit: 7,
  bonds: 8,
  reit: 9,
  inzhur: 14,
  stocks: 10,
  crypto: 11,
  other: 12,
};

const DEBT_SLOT: Record<DebtKind, number> = {
  mortgage: 13,
  loan: 5,
  card: 3,
};

export function accountColorSlot(kind: AccountKind): number {
  return ACCOUNT_SLOT[kind] ?? 5;
}

export function investmentColorSlot(kind: InvestmentKind): number {
  return INVESTMENT_SLOT[kind] ?? 12;
}

export function debtColorSlot(kind: DebtKind): number {
  return DEBT_SLOT[kind] ?? 13;
}

export const SUBSCRIPTION_SLOT = 8;

export function valuationOf(kind: InvestmentKind): Valuation {
  return investmentKind(kind).valuation;
}

export const CURRENCIES: Currency[] = ["UAH", "USD", "EUR"];

export const CORE_CURRENCIES: Currency[] = ["UAH", "USD", "EUR"];

export const FOREIGN_CURRENCIES = ["USD", "EUR"] as const;

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

export function displayCurrencies(state: AppState): Currency[] {
  const used = new Set<Currency>([state.settings.baseCurrency]);
  for (const a of state.savings) used.add(a.currency);
  for (const i of state.investments) used.add(i.currency);
  for (const d of state.debts) used.add(d.currency);
  for (const s of state.subscriptions) used.add(s.currency);
  for (const r of state.recurring) used.add(r.currency);
  for (const tx of state.transactions) used.add(tx.currency);
  return CURRENCIES.filter((c) => CORE_CURRENCIES.includes(c) || used.has(c));
}

export const THEME_KEY = "finance-tracker:theme";
export const LOCALE_KEY = "finance-tracker:locale";

function cat(
  id: string,
  name: string,
  icon: string,
  colorSlot: number,
  kind: Category["kind"],
  parentId?: string,
): Category {
  return parentId
    ? { id, name, icon, colorSlot, kind, parentId }
    : { id, name, icon, colorSlot, kind };
}

export const DEFAULT_CATEGORIES: Category[] = [
  cat("cat-housing", "Housing", "🏠", 1, "expense"),
  cat("cat-rent", "Rent", "🔑", 1, "expense", "cat-housing"),
  cat("cat-utilities", "Utilities", "💡", 1, "expense", "cat-housing"),
  cat("cat-internet", "Internet & Phone", "📶", 1, "expense", "cat-housing"),
  cat("cat-household", "Household", "🧴", 1, "expense", "cat-housing"),
  cat("cat-repairs", "Repairs", "🛠️", 1, "expense", "cat-housing"),

  cat("cat-food", "Food", "🍽️", 3, "expense"),
  cat("cat-groceries", "Groceries", "🛒", 3, "expense", "cat-food"),
  cat("cat-restaurants", "Restaurants & Cafés", "🍝", 3, "expense", "cat-food"),
  cat("cat-delivery", "Food Delivery", "🛵", 3, "expense", "cat-food"),
  cat("cat-coffee", "Coffee & Snacks", "☕", 3, "expense", "cat-food"),

  cat("cat-transport", "Transport", "🚗", 2, "expense"),
  cat("cat-fuel", "Fuel", "⛽", 2, "expense", "cat-transport"),
  cat("cat-public-transport", "Public Transport", "🚇", 2, "expense", "cat-transport"),
  cat("cat-taxi", "Taxi", "🚕", 2, "expense", "cat-transport"),
  cat("cat-car", "Car Maintenance", "🔧", 2, "expense", "cat-transport"),
  cat("cat-parking", "Parking & Tolls", "🅿️", 2, "expense", "cat-transport"),

  cat("cat-health", "Health", "💊", 4, "expense"),
  cat("cat-pharmacy", "Pharmacy", "💉", 4, "expense", "cat-health"),
  cat("cat-doctors", "Doctors & Dentist", "🩺", 4, "expense", "cat-health"),
  cat("cat-fitness", "Sport & Fitness", "🏋️", 4, "expense", "cat-health"),
  cat("cat-insurance", "Insurance", "🛡️", 4, "expense", "cat-health"),

  cat("cat-shopping", "Shopping", "🛍️", 5, "expense"),
  cat("cat-clothes", "Clothes & Shoes", "👕", 5, "expense", "cat-shopping"),
  cat("cat-electronics", "Electronics", "💻", 5, "expense", "cat-shopping"),
  cat("cat-beauty", "Beauty & Care", "💄", 5, "expense", "cat-shopping"),

  cat("cat-wants", "Fun & Wants", "🎉", 6, "expense"),
  cat("cat-games", "Games", "🎮", 6, "expense", "cat-wants"),
  cat("cat-events", "Movies & Events", "🎬", 6, "expense", "cat-wants"),
  cat("cat-hobbies", "Hobbies", "🎨", 6, "expense", "cat-wants"),
  cat("cat-travel", "Travel", "✈️", 6, "expense", "cat-wants"),

  cat("cat-subs", "Subscriptions", "📱", 8, "expense"),

  cat("cat-education", "Education", "📚", 7, "expense"),
  cat("cat-courses", "Courses", "🎓", 7, "expense", "cat-education"),
  cat("cat-books", "Books", "📖", 7, "expense", "cat-education"),

  cat("cat-kids", "Kids", "🧸", 2, "expense"),
  cat("cat-pets", "Pets", "🐾", 3, "expense"),
  cat("cat-gifts-out", "Gifts", "🎁", 7, "expense"),

  cat("cat-charity", "Charity & Donations", "❤️", 4, "expense"),
  cat("cat-army", "Army Support", "🇺🇦", 4, "expense", "cat-charity"),

  cat("cat-taxes", "Taxes & Fees", "🧾", 5, "expense"),
  cat("cat-fees", "Bank Fees", "🏧", 5, "expense", "cat-taxes"),

  cat("cat-unexpected", "Unexpected", "⚡", 7, "expense"),
  cat("cat-other-exp", "Other", "📦", 3, "expense"),

  cat("cat-salary", "Salary", "💼", 2, "income"),
  cat("cat-freelance", "Freelance", "🧑‍💻", 1, "income"),
  cat("cat-business", "Business", "🏢", 6, "income"),
  cat("cat-interest", "Interest", "🏦", 5, "income"),
  cat("cat-dividends", "Dividends", "📈", 4, "income"),
  cat("cat-rental", "Rental Income", "🏘️", 1, "income"),
  cat("cat-cashback", "Cashback", "💸", 8, "income"),
  cat("cat-sale", "Sale", "🏷️", 8, "income"),
  cat("cat-refunds", "Refunds", "↩️", 3, "income"),
  cat("cat-gifts-in", "Gifts", "🎁", 7, "income"),
  cat("cat-other-inc", "Other", "💰", 3, "income"),
];

export const DEFAULT_CATEGORY_NAMES: ReadonlyMap<string, string> = new Map(
  DEFAULT_CATEGORIES.map((c) => [c.id, c.name]),
);

export const LEGACY_DEFAULT_NAMES: Record<string, string> = {
  "cat-clothes": "Clothes",
};

export const DEFAULT_RATES = { USD: 44.6, EUR: 50.8 };

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
    locale: "en",
    tax: DEFAULT_TAX_PROFILE,
    rates: DEFAULT_RATES,
    ratesSource: "manual",
  },
};

export const ICON_CHOICES = [
  "💵", "🏦", "💳", "🐷", "🧧", "🏠", "🚗", "✈️", "🎓", "💍",
  "🛒", "🍽️", "💊", "🎬", "👕", "📱", "📚", "🎁", "📦", "💰",
  "🧑‍💻", "💼", "⚡", "🌊", "🛡️", "🎯", "🎮", "🎵", "☁️", "🤖",
  "☕", "⛽", "🚕", "🐾", "🧸", "❤️", "🧾", "💻", "💄", "🏋️",
  "🎨", "🔑", "📶", "🛠️", "🩺", "🏘️", "💸", "↩️", "🇺🇦", "🏛️",
];

export function mergeDefaultCategories(categories: Category[]): {
  categories: Category[];
  added: number;
  linked: number;
} {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let added = 0;
  let linked = 0;
  const next = categories.map((c) => {
    const def = DEFAULT_CATEGORIES.find((d) => d.id === c.id);
    if (def?.parentId && !c.parentId && c.kind === def.kind) {
      linked++;
      return { ...c, parentId: def.parentId };
    }
    return c;
  });
  for (const def of DEFAULT_CATEGORIES) {
    if (byId.has(def.id)) continue;
    next.push(def);
    added++;
  }
  return { categories: next, added, linked };
}
