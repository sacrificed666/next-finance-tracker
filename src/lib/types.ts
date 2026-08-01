export type Currency = "UAH" | "USD" | "EUR";

/** categories only ever describe money in or out */
export type CategoryKind = "income" | "expense";

/**
 * A transfer moves money between two of your own accounts, so it is neither
 * income nor spending — every income/expense aggregation ignores it.
 */
export type TxType = CategoryKind | "transfer";

export interface Category {
  id: string;
  name: string;
  icon: string; // emoji
  /** chart series slot 1..8 — color follows the entity, never its rank */
  colorSlot: number;
  kind: CategoryKind;
}

/**
 * Optional day-rate breakdown attached to an income transaction: the amount
 * equals days * dailyRate + premium + compensations - cutoffs. Present only
 * when the income was entered via the contract calculator; simple incomes
 * (freelance gig, gift, interest, sale…) omit it.
 */
export interface IncomeBreakdown {
  days: number;
  dailyRate: number;
  premium: number;
  compensations: number;
  cutoffs: number;
}

/**
 * Ukrainian sole-proprietor (ФОП) tax applied to a salary: the take-home is
 * `gross * (1 - ratePct/100) - fixedUAH` (the fixed part converted into the
 * income currency). When present on a transaction, `amount` is already the
 * net take-home and `gross` is the pre-tax figure.
 */
export interface IncomeTax {
  ratePct: number; // percent removed, e.g. 6 (5% single tax + 1% military levy)
  fixedUAH: number; // fixed UAH deduction, e.g. 1902.34 (ЄСВ)
  gross: number; // pre-tax amount, in the transaction currency
}

export interface Transaction {
  id: string;
  type: TxType;
  /** amount leaving/entering `accountId`, in `currency` */
  amount: number;
  currency: Currency;
  /** empty on transfers, which move money rather than earn or spend it */
  categoryId: string;
  date: string; // ISO yyyy-mm-dd
  note?: string;
  /**
   * Account the money moved through. Income adds to it, expense subtracts,
   * a transfer moves from here to `toAccountId`. Optional: rows recorded
   * before accounts were linked (or deliberately left unassigned) simply do
   * not affect any balance.
   */
  accountId?: string;
  /** transfer destination */
  toAccountId?: string;
  /**
   * Amount arriving at `toAccountId`, in that account's currency. Only
   * differs from `amount` on a cross-currency transfer (₴ → $), where it
   * also pins the rate actually used.
   */
  toAmount?: number;
  /** set when materialized from a recurring rule */
  recurringId?: string;
  /** set when materialized from a subscription */
  subscriptionId?: string;
  /** day-rate breakdown, on contract-billed income only */
  breakdown?: IncomeBreakdown;
  /** tax detail, on taxed salary income only (amount is the net take-home) */
  tax?: IncomeTax;
}

export interface RecurringRule {
  id: string;
  type: CategoryKind;
  amount: number;
  currency: Currency;
  categoryId: string;
  note?: string;
  /** account the generated transactions move through */
  accountId?: string;
  /** day of month to post on (clamped to month length) */
  dayOfMonth: number;
  startMonth: string; // yyyy-mm
  endMonth?: string; // yyyy-mm inclusive
  /** last yyyy-mm for which a transaction was materialized */
  lastAppliedMonth?: string;
}

export type SubscriptionPeriod = "monthly" | "yearly";

/** a paid subscription that auto-posts an expense on its billing cycle while active */
export interface Subscription {
  id: string;
  name: string;
  icon: string;
  price: number;
  currency: Currency;
  /** billed every month or once a year (yearly cost is split /12 for budgets) */
  period: SubscriptionPeriod;
  /** account the generated charges come out of */
  accountId?: string;
  /** day of month the charge lands on */
  dayOfMonth: number;
  startMonth: string; // yyyy-mm
  active: boolean;
  lastAppliedMonth?: string;
}

export interface SavingsAccount {
  id: string;
  name: string;
  icon: string;
  currency: Currency;
  /**
   * What the account held when you started tracking it. The balance shown in
   * the app is this plus every transaction assigned to the account, so money
   * moves because it was recorded — never because it was typed over.
   */
  openingBalance: number;
  goal?: {
    target: number;
    deadline?: string; // yyyy-mm-dd
  };
}

export type Compounding = "reinvest" | "payout";
export type CompoundingFreq = "monthly" | "quarterly" | "annually";

export interface Investment {
  id: string;
  name: string;
  currency: Currency;
  principal: number;
  /** annual nominal rate, percent (e.g. 14 for 14%) */
  annualRatePct: number;
  startDate: string; // yyyy-mm-dd
  /**
   * Maturity, when the position stops earning: a term deposit pays out on its
   * end date and the money stands still from then on. Optional — an open-ended
   * holding (an index fund, a rolling account) simply never has one, and keeps
   * compounding for as long as the projection runs.
   */
  endDate?: string; // yyyy-mm-dd
  /** reinvest = compound interest; payout = interest paid out (simple) */
  compounding: Compounding;
  compoundingFreq: CompoundingFreq;
  /** optional recurring top-up, same currency */
  monthlyContribution?: number;
  note?: string;
}

export interface Budget {
  categoryId: string;
  /** monthly limit in `currency` */
  limit: number;
  currency: Currency;
}

export type DebtKind = "mortgage" | "loan" | "card";

/**
 * Money you owe — a mortgage, a consumer loan, a credit-card balance. The
 * outstanding `balance` is a liability: it is subtracted from net worth. Unlike
 * accounts, a debt is tracked by its current balance directly (you lower it as
 * you pay it down), not derived from transactions.
 */
export interface Debt {
  id: string;
  name: string;
  icon: string;
  kind: DebtKind;
  currency: Currency;
  /** outstanding amount still owed, in `currency` */
  balance: number;
  /** original amount borrowed, for payoff context (optional) */
  principal?: number;
  /** annual interest rate, percent (optional) */
  annualRatePct?: number;
  /** scheduled monthly payment, in `currency` (optional) */
  monthlyPayment?: number;
  note?: string;
}

export type ThemePref = "system" | "light" | "dark";

export type RatesSource = "manual" | "nbu" | "monobank";

export interface Settings {
  baseCurrency: Currency;
  theme: ThemePref;
  /** default ФОП tax applied when the salary tax toggle is on */
  tax: { ratePct: number; fixedUAH: number };
  /** UAH per 1 unit of foreign currency (conversion uses the bank buy rate) */
  rates: { USD: number; EUR: number };
  /** bank buy/sell detail when fetched from an API */
  ratesMeta?: {
    USD?: { buy: number; sell: number };
    EUR?: { buy: number; sell: number };
  };
  ratesUpdatedAt?: string; // ISO datetime
  ratesSource: RatesSource;
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
  settings: Settings;
}
