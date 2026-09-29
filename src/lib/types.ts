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
  tags?: string[];
  externalId?: string;
  bank?: { time?: number; opAmount?: number; opCurrency?: Currency };
  splitId?: string;
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
  rollover?: boolean;
}

export interface CategoryRule {
  id: string;
  match: string;
  categoryId: string;
  type: "income" | "expense";
}

export interface Receivable {
  id: string;
  name: string;
  icon: string;
  amount: number;
  currency: Currency;
  date: string;
  dueDate?: string;
  repaid: number;
  note?: string;
}

export type WishPriority = "high" | "normal" | "low";

export interface WishItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  currency: Currency;
  priority: WishPriority;
  url?: string;
  note?: string;
  month?: string;
  createdAt: string;
}

export interface PlannedEvent {
  id: string;
  month: string;
  amount: number;
  currency: Currency;
  note: string;
}

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

export type DashboardCardId =
  | "quickAdd"
  | "cashFlow"
  | "spending"
  | "cashAhead"
  | "holdings"
  | "subscriptions"
  | "currency"
  | "progress";

export interface DashboardLayout {
  main: DashboardCardId[];
  side: DashboardCardId[];
  hidden: DashboardCardId[];
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
  taxPaid?: Record<string, string>;
  bankLinks?: Record<string, string>;
  dashboard?: DashboardLayout;
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
