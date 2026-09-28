export type Currency = "UAH" | "USD" | "EUR";

export type Locale = "en" | "uk" | "de" | "fr" | "es" | "pl" | "it" | "nl";

export type CategoryKind = "income" | "expense";

export type TxType = CategoryKind | "transfer";

export interface Category {
  id: string;
  name: string;
  icon: string;
  colorSlot: number;
  kind: CategoryKind;
  parentId?: string;
}

export interface IncomeBreakdown {
  days: number;
  dailyRate: number;
  premium: number;
  compensations: number;
  cutoffs: number;
}

export type TaxRegimeId =
  | "none"
  | "fop1"
  | "fop2"
  | "fop3"
  | "fop3vat"
  | "fop4"
  | "general"
  | "custom";

export interface TaxProfile {
  regime: TaxRegimeId;
  ratePct: number;
  fixedUAH: number;
  vatPct: number;
  label: string;
}

export interface IncomeTax {
  ratePct: number;
  fixedUAH: number;
  gross: number;
  regime?: TaxRegimeId;
  vatPct?: number;
  label?: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  currency: Currency;
  categoryId: string;
  date: string;
  note?: string;
  accountId?: string;
  toAccountId?: string;
  toAmount?: number;
  recurringId?: string;
  subscriptionId?: string;
  breakdown?: IncomeBreakdown;
  tax?: IncomeTax;
  /** Free labels across categories: a trip, a project, a gift. */
  tags?: string[];
  /** Where an imported entry came from ("mono:<id>", "csv:<hash>") — keeps a re-import from duplicating it. */
  externalId?: string;
  /**
   * What the bank said about an imported operation beyond the amount: the exact moment,
   * and the amount in the operation's own currency when it differed. Lets the two
   * halves of a transfer be paired even when they arrive separately.
   */
  bank?: { time?: number; opAmount?: number; opCurrency?: Currency };
  /** Pieces of one purchase split across categories share this id. */
  splitId?: string;
  /** Photos of the receipt, stored separately and fetched on demand. */
  attachmentIds?: string[];
}

export interface RecurringRule {
  id: string;
  type: CategoryKind;
  amount: number;
  currency: Currency;
  categoryId: string;
  note?: string;
  accountId?: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string;
  lastAppliedMonth?: string;
}

export type SubscriptionPeriod = "monthly" | "yearly";

export interface Subscription {
  id: string;
  name: string;
  icon: string;
  price: number;
  currency: Currency;
  period: SubscriptionPeriod;
  accountId?: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth?: string;
  active: boolean;
  lastAppliedMonth?: string;
}

export type AccountKind = "card" | "cash" | "savings" | "wallet" | "crypto" | "skins" | "other";

export interface CoinHolding {
  coin: string;
  quantity: number;
  price?: number;
  icon?: string;
}

export interface SavingsAccount {
  id: string;
  name: string;
  icon: string;
  kind: AccountKind;
  game?: string;
  gameName?: string;
  gameLogo?: string;
  bank?: string;
  currency: Currency;
  openingBalance: number;
  holdings?: CoinHolding[];
  pricedAt?: string;
  goal?: {
    target: number;
    deadline?: string;
  };
}

export type Compounding = "reinvest" | "payout";
export type CompoundingFreq = "monthly" | "quarterly" | "annually";

export type InvestmentKind =
  | "deposit"
  | "bonds"
  | "reit"
  | "inzhur"
  | "stocks"
  | "crypto"
  | "other";

export type Valuation = "accrual" | "market";

export interface Investment {
  id: string;
  name: string;
  kind: InvestmentKind;
  currency: Currency;
  principal: number;
  annualRatePct: number;
  marketValue?: number;
  coin?: string;
  fund?: string;
  quantity?: number;
  pricedAt?: string;
  coinIcon?: string;
  startDate: string;
  endDate?: string;
  compounding: Compounding;
  compoundingFreq: CompoundingFreq;
  monthlyContribution?: number;
  note?: string;
}

export interface Budget {
  categoryId: string;
  limit: number;
  currency: Currency;
  /** Unspent money from last month is added to this month's limit. */
  rollover?: boolean;
}

/** "Description contains … → category", applied to imported entries. */
export interface CategoryRule {
  id: string;
  match: string;
  categoryId: string;
  type: "income" | "expense";
}

/** Money someone owes you. Counts towards net worth until it is repaid. */
export interface Receivable {
  id: string;
  name: string;
  icon: string;
  amount: number;
  currency: Currency;
  /** When the money was lent. */
  date: string;
  dueDate?: string;
  /** How much has come back so far. */
  repaid: number;
  note?: string;
}

export type WishPriority = "high" | "normal" | "low";

/** Something you want to buy. */
export interface WishItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  currency: Currency;
  priority: WishPriority;
  url?: string;
  note?: string;
  /** The month you plan to buy it; it then shows up in the forecast. */
  month?: string;
  createdAt: string;
}

/** A one-off amount the forecast adds in a given month: a purchase (negative) or a windfall. */
export interface PlannedEvent {
  id: string;
  month: string;
  amount: number;
  currency: Currency;
  note: string;
}

/** Net worth on one day, in hryvnias, with the rates of that day so it converts faithfully later. */
export interface NetWorthSnapshot {
  date: string;
  total: number;
  savings: number;
  investments: number;
  debts: number;
  receivables: number;
  rates: { USD: number; EUR: number };
}

export type DebtKind = "mortgage" | "loan" | "card";

export interface Debt {
  id: string;
  name: string;
  icon: string;
  kind: DebtKind;
  currency: Currency;
  balance: number;
  principal?: number;
  annualRatePct?: number;
  monthlyPayment?: number;
  note?: string;
}

export type ThemePref = "system" | "light" | "dark";

export type RatesSource = "manual" | "nbu" | "monobank";

export interface Settings {
  baseCurrency: Currency;
  theme: ThemePref;
  locale: Locale;
  tax: TaxProfile;
  rates: { USD: number; EUR: number };
  ratesMeta?: {
    USD?: { buy: number; sell: number };
    EUR?: { buy: number; sell: number };
  };
  ratesUpdatedAt?: string;
  ratesSource: RatesSource;
  /** Tax obligations marked as paid: obligation id → the day it was paid. */
  taxPaid?: Record<string, string>;
  /** Monobank account id → the app account its operations are booked to. */
  bankLinks?: Record<string, string>;
}

export interface AppState {
  version: 1;
  transactions: Transaction[];
  categories: Category[];
  recurring: RecurringRule[];
  subscriptions: Subscription[];
  savings: SavingsAccount[];
  investments: Investment[];
  budgets: Budget[];
  debts: Debt[];
  rules: CategoryRule[];
  receivables: Receivable[];
  wishlist: WishItem[];
  plannedEvents: PlannedEvent[];
  snapshots: NetWorthSnapshot[];
  settings: Settings;
}
