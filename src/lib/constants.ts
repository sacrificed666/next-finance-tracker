import type { AppState, Category, Currency } from "./types";

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
