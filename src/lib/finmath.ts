import {
  addMonths,
  dateInMonth,
  monthDiff,
  monthOf,
  wholeMonthsBetween,
  yearsBetween,
} from "./date";
import { convert } from "./money";
import type {
  AppState,
  Currency,
  IncomeBreakdown,
  Investment,
  SavingsAccount,
  Settings,
  Subscription,
  Transaction,
} from "./types";

const FREQ_PER_YEAR = { monthly: 12, quarterly: 4, annually: 1 } as const;

export interface InvestmentSnapshot {
  /** money put in: principal + contributions so far, in the investment currency */
  invested: number;
  /** current worth of the position (for payout — equals invested) */
  value: number;
  /** interest earned and kept inside the position (reinvest only) */
  accrued: number;
  /** interest paid out to the owner so far (payout only) */
  paidOut: number;
}

/**
 * Position state at date `atISO`.
 * reinvest: value compounds at rate/freq; monthly contributions compound
 * from the month they are made.
 * payout: interest is paid out (simple, linear); position value stays at
 * principal + contributions.
 */
export function investmentAt(inv: Investment, atISO: string): InvestmentSnapshot {
  const t = yearsBetween(inv.startDate, atISO); // fractional years
  const r = inv.annualRatePct / 100;
  const f = FREQ_PER_YEAR[inv.compoundingFreq];
  const c = inv.monthlyContribution ?? 0;
  // contributions land monthly starting one month after startDate. Counted
  // by actual elapsed calendar months (not t*12, which under/over-counts
  // around months shorter than the 365.25/12-day average — e.g. February).
  const n = wholeMonthsBetween(inv.startDate, atISO);
  const invested = inv.principal + c * n;

  if (t <= 0) return { invested: inv.principal, value: inv.principal, accrued: 0, paidOut: 0 };

  if (inv.compounding === "reinvest") {
    const growth = Math.pow(1 + r / f, f * t);
    // effective monthly rate consistent with the compounding frequency
    const im = Math.pow(1 + r / f, f / 12) - 1;
    const contribFV =
      c === 0 || n === 0
        ? 0
        : im === 0
          ? c * n
          : c * ((Math.pow(1 + im, n) - 1) / im);
    const value = inv.principal * growth + contribFV;
    return { invested, value, accrued: value - invested, paidOut: 0 };
  }

  // payout: simple interest on principal for t years, plus on each
  // contribution from the month it was made
  const contribInterest = c * r * ((n * (n - 1)) / 2 / 12);
  const paidOut = inv.principal * r * t + contribInterest;
  return { invested, value: invested, accrued: 0, paidOut };
}

/** value of one investment converted to the base currency */
export function investmentValueInBase(
  inv: Investment,
  atISO: string,
  settings: Settings,
): number {
  const snap = investmentAt(inv, atISO);
  return convert(snap.value, inv.currency, settings.baseCurrency, settings.rates);
}

export interface NetWorth {
  savings: number;
  investments: number;
  /** total owed across all debts, in base currency (>= 0) */
  debts: number;
  /** gross holdings: savings + investments */
  assets: number;
  /** net worth = assets - debts */
  total: number;
}

/** total owed across every debt, converted to the base currency (>= 0) */
export function debtsTotal(state: AppState): number {
  const { settings } = state;
  return state.debts.reduce(
    (sum, d) => sum + convert(d.balance, d.currency, settings.baseCurrency, settings.rates),
    0,
  );
}

/* ────────────────────────────── account balances ────────────────────────────── */

/**
 * Live balance of one account: its opening balance plus everything recorded
 * against it. Income adds, expense subtracts, and a transfer subtracts from
 * the source while adding `toAmount` to the destination — so a cross-currency
 * move lands at the rate that was actually used, not today's.
 *
 * Transactions dated in the future (planned recurring costs) are included only
 * when `upToISO` is omitted; pass today's date to get the balance as of now.
 */
export function accountBalance(
  account: SavingsAccount,
  transactions: Transaction[],
  upToISO?: string,
): number {
  let balance = account.openingBalance;
  for (const tx of transactions) {
    if (upToISO && tx.date > upToISO) continue;
    if (tx.type === "transfer") {
      if (tx.accountId === account.id) balance -= tx.amount;
      if (tx.toAccountId === account.id) balance += tx.toAmount ?? tx.amount;
      continue;
    }
    if (tx.accountId !== account.id) continue;
    balance += tx.type === "income" ? tx.amount : -tx.amount;
  }
  return balance;
}

/** every account's live balance, keyed by account id */
export function accountBalances(
  state: AppState,
  upToISO?: string,
): Map<string, number> {
  return new Map(
    state.savings.map((acc) => [
      acc.id,
      accountBalance(acc, state.transactions, upToISO),
    ]),
  );
}

/** current net worth in the base currency */
export function netWorth(state: AppState, todayISO: string): NetWorth {
  const { settings } = state;
  const balances = accountBalances(state, todayISO);
  const savings = state.savings.reduce(
    (sum, acc) =>
      sum +
      convert(balances.get(acc.id) ?? 0, acc.currency, settings.baseCurrency, settings.rates),
    0,
  );
  const investments = state.investments.reduce(
    (sum, inv) => sum + investmentValueInBase(inv, todayISO, settings),
    0,
  );
  const debts = debtsTotal(state);
  const assets = savings + investments;
  return { savings, investments, debts, assets, total: assets - debts };
}

export interface ProjectionPoint {
  month: string; // yyyy-mm
  savings: number;
  investments: number;
  total: number;
}

export interface ProjectionOptions {
  /** amount added to savings each month, in the base currency */
  monthlySavings: number;
  /** annual return the savings pot earns, percent (0 = cash under a mattress) */
  savingsReturnPct?: number;
}

/**
 * Wealth projection from `todayISO`, monthly steps, in the base currency.
 * Savings compound at `savingsReturnPct` and grow by `monthlySavings` plus any
 * payout interest received that month; investments grow by their own
 * compounding and contributions.
 */
export function buildProjection(
  state: AppState,
  todayISO: string,
  horizonMonths: number,
  opts: ProjectionOptions,
): ProjectionPoint[] {
  const { settings } = state;
  const startMonth = monthOf(todayISO);
  const day = Number(todayISO.slice(8, 10));
  const monthlyReturn = (opts.savingsReturnPct ?? 0) / 100 / 12;

  const balancesNow = accountBalances(state, todayISO);
  const savingsNow = state.savings.reduce(
    (sum, acc) =>
      sum +
      convert(balancesNow.get(acc.id) ?? 0, acc.currency, settings.baseCurrency, settings.rates),
    0,
  );

  // investment value + cumulative payout at a given month offset, in base
  const investmentsAt = (m: number) => {
    // clamp today's day-of-month into the target month — a raw concatenation
    // like `${month}-31` silently rolls over into the next month whenever the
    // target month is shorter (JS Date parses "2027-02-31" as Mar 3).
    const atISO = dateInMonth(addMonths(startMonth, m), day);
    let value = 0;
    let paidOut = 0;
    for (const inv of state.investments) {
      const snap = investmentAt(inv, atISO);
      value += convert(snap.value, inv.currency, settings.baseCurrency, settings.rates);
      paidOut += convert(snap.paidOut, inv.currency, settings.baseCurrency, settings.rates);
    }
    return { value, paidOut };
  };

  const first = investmentsAt(0);
  const points: ProjectionPoint[] = [
    { month: startMonth, savings: savingsNow, investments: first.value, total: savingsNow + first.value },
  ];

  let savings = savingsNow;
  let prevPaidOut = first.paidOut;
  for (let m = 1; m <= horizonMonths; m++) {
    const inv = investmentsAt(m);
    const payoutInflow = Math.max(0, inv.paidOut - prevPaidOut);
    prevPaidOut = inv.paidOut;
    savings = savings * (1 + monthlyReturn) + opts.monthlySavings + payoutInflow;
    points.push({
      month: addMonths(startMonth, m),
      savings,
      investments: inv.value,
      total: savings + inv.value,
    });
  }
  return points;
}

/* ---------- transaction aggregation ---------- */

export interface MonthTotals {
  income: number;
  expense: number;
  net: number;
}

/** income/expense totals for a yyyy-mm month, in the base currency */
export function monthTotals(
  transactions: Transaction[],
  month: string,
  settings: Settings,
): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    // transfers only move money between your own accounts — they are neither
    if (tx.type === "transfer" || monthOf(tx.date) !== month) continue;
    const v = convert(tx.amount, tx.currency, settings.baseCurrency, settings.rates);
    if (tx.type === "income") income += v;
    else expense += v;
  }
  return { income, expense, net: income - expense };
}

/** totals for the last `count` months ending at `month` (inclusive), oldest first */
export function monthlySeries(
  transactions: Transaction[],
  month: string,
  count: number,
  settings: Settings,
): Array<MonthTotals & { month: string }> {
  const result: Array<MonthTotals & { month: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    result.push({ month: m, ...monthTotals(transactions, m, settings) });
  }
  return result;
}

/** expenses of a month grouped by category, in base currency, desc */
export function expensesByCategory(
  transactions: Transaction[],
  month: string,
  settings: Settings,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || monthOf(tx.date) !== month) continue;
    const v = convert(tx.amount, tx.currency, settings.baseCurrency, settings.rates);
    byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + v);
  }
  return new Map([...byCat.entries()].sort((a, b) => b[1] - a[1]));
}

/** spent in a category for a month, in the target currency */
export function spentInCategory(
  transactions: Transaction[],
  categoryId: string,
  month: string,
  to: Currency,
  settings: Settings,
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    if (tx.categoryId !== categoryId || monthOf(tx.date) !== month) continue;
    sum += convert(tx.amount, tx.currency, to, settings.rates);
  }
  return sum;
}

/** average monthly net (income - expense) over the trailing `count` full months */
export function averageMonthlyNet(
  transactions: Transaction[],
  currentMonth: string,
  count: number,
  settings: Settings,
): number {
  let sum = 0;
  let monthsWithData = 0;
  for (let i = 1; i <= count; i++) {
    const m = addMonths(currentMonth, -i);
    const t = monthTotals(transactions, m, settings);
    if (t.income !== 0 || t.expense !== 0) {
      sum += t.net;
      monthsWithData++;
    }
  }
  return monthsWithData === 0 ? 0 : sum / monthsWithData;
}

/**
 * Months a schedule still needs postings for, oldest first, through
 * `throughMonth` (inclusive). `stepMonths` is 1 for monthly cadence and 12
 * for yearly. Bounded by `endMonth` when set.
 */
export function dueMonths(
  schedule: { startMonth: string; endMonth?: string; lastAppliedMonth?: string },
  stepMonths: number,
  throughMonth: string,
): string[] {
  const from = schedule.lastAppliedMonth
    ? addMonths(schedule.lastAppliedMonth, stepMonths)
    : schedule.startMonth;
  const to =
    schedule.endMonth && schedule.endMonth < throughMonth ? schedule.endMonth : throughMonth;
  if (monthDiff(from, to) < 0) return [];
  const months: string[] = [];
  for (let m = from; monthDiff(m, to) >= 0; m = addMonths(m, stepMonths)) {
    months.push(m);
  }
  return months;
}

/* ---------- income ---------- */

/** days * dailyRate + premium + compensations - cutoffs */
export function breakdownTotal(b: IncomeBreakdown): number {
  return b.days * b.dailyRate + b.premium + b.compensations - b.cutoffs;
}

/**
 * Net take-home after ФОП tax: gross * (1 - ratePct/100) minus the fixed UAH
 * deduction converted into the income currency. Matches the user's sheet:
 * €1175 → €1067.05 at 6% and a 1902.34₴ fixed part.
 */
export function taxedNet(
  gross: number,
  currency: Currency,
  tax: { ratePct: number; fixedUAH: number },
  settings: Settings,
): number {
  const fixedInCurrency = convert(tax.fixedUAH, "UAH", currency, settings.rates);
  return gross * (1 - tax.ratePct / 100) - fixedInCurrency;
}

/**
 * Income between `fromMonth` and `toMonth` (inclusive) grouped by category,
 * in the base currency, sorted desc. Mirrors `expensesByCategory` but spans
 * a range because income is typically sparser than spending.
 */
export function incomeByCategory(
  transactions: Transaction[],
  fromMonth: string,
  toMonth: string,
  settings: Settings,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "income") continue;
    const m = monthOf(tx.date);
    if (m < fromMonth || m > toMonth) continue;
    const v = convert(tx.amount, tx.currency, settings.baseCurrency, settings.rates);
    byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + v);
  }
  return new Map([...byCat.entries()].sort((a, b) => b[1] - a[1]));
}

/* ---------- subscriptions ---------- */

/** a subscription's cost spread to one month (yearly split /12), converted to `to` */
export function subscriptionMonthlyCost(
  sub: Subscription,
  to: Currency,
  settings: Settings,
): number {
  const perMonth = sub.period === "yearly" ? sub.price / 12 : sub.price;
  return convert(perMonth, sub.currency, to, settings.rates);
}

/** monthly-equivalent cost of active subscriptions, converted to `to` */
export function subscriptionsMonthlyTotal(
  subscriptions: Subscription[],
  to: Currency,
  settings: Settings,
): number {
  return subscriptions
    .filter((s) => s.active)
    .reduce((sum, s) => sum + subscriptionMonthlyCost(s, to, settings), 0);
}

/* ---------- net-worth breakdowns ---------- */

export interface Holding {
  id: string;
  label: string;
  icon: string;
  currency: Currency;
  /** value in the holding's own currency */
  native: number;
  /** value converted to the base currency */
  base: number;
  kind: "account" | "investment";
}

/** every account and investment as one flat list (the balance-sheet rows) */
export function holdings(state: AppState, todayISO: string): Holding[] {
  const { settings } = state;
  const balances = accountBalances(state, todayISO);
  const rows: Holding[] = state.savings.map((acc) => {
    const native = balances.get(acc.id) ?? 0;
    return {
      id: acc.id,
      label: acc.name,
      icon: acc.icon,
      currency: acc.currency,
      native,
      base: convert(native, acc.currency, settings.baseCurrency, settings.rates),
      kind: "account" as const,
    };
  });
  for (const inv of state.investments) {
    const value = investmentAt(inv, todayISO).value;
    rows.push({
      id: inv.id,
      label: inv.name,
      icon: "📈",
      currency: inv.currency,
      native: value,
      base: convert(value, inv.currency, settings.baseCurrency, settings.rates),
      kind: "investment",
    });
  }
  return rows;
}

/** net worth grouped by the currency the money is actually held in */
export function currencyAllocation(
  state: AppState,
  todayISO: string,
): Array<{ currency: Currency; native: number; base: number }> {
  const byCurrency = new Map<Currency, { native: number; base: number }>();
  for (const h of holdings(state, todayISO)) {
    const entry = byCurrency.get(h.currency) ?? { native: 0, base: 0 };
    entry.native += h.native;
    entry.base += h.base;
    byCurrency.set(h.currency, entry);
  }
  return [...byCurrency.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => b.base - a.base);
}
