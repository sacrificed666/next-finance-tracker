import {
  addMonths,
  dateInMonth,
  monthDiff,
  monthOf,
  wholeMonthsBetween,
  yearsBetween,
} from "./date";
import {
  ACCOUNT_KINDS,
  INVESTMENT_KINDS,
  investmentKind,
  valuationOf,
} from "./constants";
import { convert } from "./money";
import type {
  AppState,
  Currency,
  Debt,
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
 *
 * Past `endDate` the position is frozen at what it was worth on maturity: a
 * two-year deposit stops paying on the day it ends, and a forecast that let it
 * keep compounding was quietly promising money the bank never will.
 */
export function investmentAt(inv: Investment, atISO: string): InvestmentSnapshot {
  // A market-valued holding is worth what you last said it was worth, at every
  // date. There is no rate to compound and no history to interpolate, so the
  // only honest answer is a flat line — see `Valuation` in types.ts. Gain is
  // then simply what it is worth now against what went in.
  if (valuationOf(inv.kind) === "market") {
    const value = inv.marketValue ?? inv.principal;
    return {
      invested: inv.principal,
      value,
      accrued: value - inv.principal,
      paidOut: 0,
    };
  }


  const asOf = inv.endDate && atISO > inv.endDate ? inv.endDate : atISO;
  const t = yearsBetween(inv.startDate, asOf); // fractional years
  const r = inv.annualRatePct / 100;
  const f = FREQ_PER_YEAR[inv.compoundingFreq];
  const c = inv.monthlyContribution ?? 0;
  // contributions land monthly starting one month after startDate. Counted
  // by actual elapsed calendar months (not t*12, which under/over-counts
  // around months shorter than the 365.25/12-day average — e.g. February).
  const n = wholeMonthsBetween(inv.startDate, asOf);
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

/**
 * What a position is worth at a future date, in its own currency.
 *
 * The split matters. `investmentAt` answers "what is this worth", and for a
 * market holding the only honest answer is the last figure you had — an
 * expected return must never inflate today's net worth. This answers "what
 * might it be worth later", so it applies that expected return, but strictly
 * forward of `todayISO`: at today it returns exactly the known value, and the
 * assumption only ever compounds over time you have not lived through yet.
 */
export function projectedSnapshot(
  inv: Investment,
  todayISO: string,
  atISO: string,
): { value: number; paidOut: number } {
  if (valuationOf(inv.kind) !== "market") {
    const snap = investmentAt(inv, atISO);
    return { value: snap.value, paidOut: snap.paidOut };
  }

  // a market holding can mature too: a fund you plan to sell in 2030, a
  // position you have already closed. Past that date nothing further accrues.
  const end = inv.endDate && atISO > inv.endDate ? inv.endDate : atISO;
  const known = investmentAt(inv, end).value;
  const years = Math.max(0, yearsBetween(todayISO, end));
  const months = wholeMonthsBetween(todayISO, end);
  const r = inv.annualRatePct / 100;
  const c = inv.monthlyContribution ?? 0;
  if (r === 0 && c === 0) return { value: known, paidOut: 0 };

  /*
   * Reinvest and payout are as real here as on a deposit — a REIT's dividend
   * either buys more units or lands in your account, and the two produce very
   * different curves. Treating every market holding as reinvesting quietly
   * assumed a DRIP nobody had switched on.
   */
  if (inv.compounding === "payout") {
    // the position itself only grows by what you put in; the return leaves it
    const value = known + c * months;
    // simple interest on the balance as it builds, the same shape the accrual
    // payout branch uses
    const paidOut = known * r * years + c * r * ((months * (months - 1)) / 2 / 12);
    return { value, paidOut };
  }

  const grown = known * Math.pow(1 + r, years);
  if (c === 0) return { value: grown, paidOut: 0 };
  // each contribution compounds from the month it lands
  const im = Math.pow(1 + r, 1 / 12) - 1;
  const contribFV = im === 0 ? c * months : c * ((Math.pow(1 + im, months) - 1) / im);
  return { value: grown + contribFV, paidOut: 0 };
}

/** what a position is worth at a future date, in its own currency */
export function investmentProjectedAt(
  inv: Investment,
  todayISO: string,
  atISO: string,
): number {
  return projectedSnapshot(inv, todayISO, atISO).value;
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

/**
 * Every account's live balance, keyed by account id. One pass over the ledger
 * for all accounts, not one pass each: the dashboard asks for this a dozen
 * times per render (the hero, the twelve months of history, the allocation
 * ring), and the per-account version made that quadratic in accounts.
 */
export function accountBalances(
  state: AppState,
  upToISO?: string,
): Map<string, number> {
  const balances = new Map(state.savings.map((acc) => [acc.id, acc.openingBalance]));
  const add = (id: string | undefined, delta: number) => {
    if (!id) return;
    const current = balances.get(id);
    if (current === undefined) return; // points at an account that is gone
    balances.set(id, current + delta);
  };
  for (const tx of state.transactions) {
    if (upToISO && tx.date > upToISO) continue;
    if (tx.type === "transfer") {
      add(tx.accountId, -tx.amount);
      add(tx.toAccountId, tx.toAmount ?? tx.amount);
      continue;
    }
    add(tx.accountId, tx.type === "income" ? tx.amount : -tx.amount);
  }
  return balances;
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
      // market holdings ride their expected return forward from today; accrual
      // ones already carry their own contracted growth. Either way a payout
      // position hands its return to savings rather than keeping it.
      const snap = projectedSnapshot(inv, todayISO, atISO);
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

/**
 * Totals for the last `count` months ending at `month` (inclusive), oldest
 * first. Buckets the ledger once and fills the window from it — calling
 * `monthTotals` per point meant `count` full passes for a single chart, and a
 * 3-year window did thirty-six of them on every keystroke elsewhere on the page.
 */
export function monthlySeries(
  transactions: Transaction[],
  month: string,
  count: number,
  settings: Settings,
): Array<MonthTotals & { month: string }> {
  const byMonth = new Map<string, MonthTotals & { month: string }>();
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    byMonth.set(m, { month: m, income: 0, expense: 0, net: 0 });
  }
  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    const bucket = byMonth.get(monthOf(tx.date));
    if (!bucket) continue;
    const v = convert(tx.amount, tx.currency, settings.baseCurrency, settings.rates);
    if (tx.type === "income") bucket.income += v;
    else bucket.expense += v;
  }
  // Map iterates in insertion order, which is oldest first by construction
  const result = [...byMonth.values()];
  for (const bucket of result) bucket.net = bucket.income - bucket.expense;
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

/**
 * Spent in a category for a month, in the target currency. Expenses only:
 * budgets measure money going out, and a refund or a reimbursement filed under
 * the same category is income — counting it here made a budget read as *more*
 * spent the moment money came back.
 */
export function spentInCategory(
  transactions: Transaction[],
  categoryId: string,
  month: string,
  to: Currency,
  settings: Settings,
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
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
      icon: investmentKind(inv.kind).icon,
      currency: inv.currency,
      native: value,
      base: convert(value, inv.currency, settings.baseCurrency, settings.rates),
      kind: "investment",
    });
  }
  return rows;
}

export interface DebtPayoff {
  /** whole months until the balance reaches zero */
  months: number;
  /** yyyy-mm the last payment lands in */
  finalMonth: string;
  /** interest paid between now and then, in the debt's currency */
  interest: number;
  /** true when the payment does not even cover the monthly interest */
  neverPaysOff: boolean;
}

/**
 * How long a debt takes to clear at its scheduled payment, and what the
 * interest costs on the way.
 *
 * The app already stores the three numbers this needs — balance, rate and
 * monthly payment — and showed a progress bar against the original amount,
 * which says where you have been and nothing about where you are going. The
 * question a debt actually raises is "when is this over".
 *
 * Returns null when there is no payment to amortise. `neverPaysOff` is the case
 * worth naming out loud: below the monthly interest the balance grows forever,
 * and a progress bar would happily imply otherwise.
 */
export function debtPayoff(debt: Debt, fromMonth: string): DebtPayoff | null {
  const payment = debt.monthlyPayment ?? 0;
  if (payment <= 0 || debt.balance <= 0) return null;
  const monthlyRate = (debt.annualRatePct ?? 0) / 100 / 12;
  const firstInterest = debt.balance * monthlyRate;
  if (payment <= firstInterest) {
    return { months: Infinity, finalMonth: "", interest: Infinity, neverPaysOff: true };
  }
  let balance = debt.balance;
  let interest = 0;
  let months = 0;
  // walked rather than solved in closed form: the last payment is a partial one,
  // and the log formula quietly rounds it into a whole extra month
  while (balance > 0 && months < 1200) {
    const charge = balance * monthlyRate;
    interest += charge;
    balance = balance + charge - payment;
    months++;
  }
  return {
    months,
    finalMonth: addMonths(fromMonth, months - 1),
    interest,
    neverPaysOff: false,
  };
}

/**
 * How much ФОП tax a period cost, and what it was charged on.
 *
 * Every taxed income row already stores its gross and the rate applied, so the
 * app knows this figure exactly — it simply never added it up. For anyone on a
 * simplified tax scheme that total is the number the year turns on.
 */
export function taxPaid(
  transactions: Transaction[],
  fromMonth: string,
  toMonth: string,
  settings: Settings,
): { tax: number; gross: number; entries: number } {
  let tax = 0;
  let gross = 0;
  let entries = 0;
  for (const tx of transactions) {
    if (tx.type !== "income" || !tx.tax) continue;
    const m = monthOf(tx.date);
    if (m < fromMonth || m > toMonth) continue;
    const to = settings.baseCurrency;
    tax += convert(tx.tax.gross - tx.amount, tx.currency, to, settings.rates);
    gross += convert(tx.tax.gross, tx.currency, to, settings.rates);
    entries++;
  }
  return { tax, gross, entries };
}

/**
 * Net worth grouped by what sort of thing it is: cash in accounts, then one
 * group per kind of investment held. A list of individual holdings answers
 * "where is it"; this answers "what is it in", which is the question behind
 * "am I too concentrated in one asset class".
 *
 * Groups with nothing in them are dropped, so the breakdown only ever shows
 * kinds you actually own.
 */
export function netWorthByKind(
  state: AppState,
  todayISO: string,
): Array<{ id: string; label: string; icon: string; base: number; colorSlot: number }> {
  const { settings } = state;
  const balances = accountBalances(state, todayISO);

  // Cash used to be one group called "Accounts", which is the same answer as
  // the total above it. A card, a jar of cash and a savings account are three
  // different kinds of liquidity, and which of them holds the money is the
  // whole point of asking.
  const byKind = new Map<string, number>();
  for (const acc of state.savings) {
    const value = convert(
      balances.get(acc.id) ?? 0,
      acc.currency,
      settings.baseCurrency,
      settings.rates,
    );
    byKind.set(`acc:${acc.kind}`, (byKind.get(`acc:${acc.kind}`) ?? 0) + value);
  }
  for (const inv of state.investments) {
    const value = investmentValueInBase(inv, todayISO, settings);
    byKind.set(`inv:${inv.kind}`, (byKind.get(`inv:${inv.kind}`) ?? 0) + value);
  }

  // One fixed slot order across both families, so a kind keeps its colour
  // whether or not the kinds above it happen to be present. Colour follows the
  // entity, never its rank.
  const rows = [
    ...ACCOUNT_KINDS.map((k, i) => ({
      id: `acc:${k.value}`,
      label: k.label,
      icon: k.icon,
      colorSlot: (i % 8) + 1,
    })),
    ...INVESTMENT_KINDS.map((k, i) => ({
      id: `inv:${k.value}`,
      label: k.label,
      icon: k.icon,
      colorSlot: ((i + ACCOUNT_KINDS.length) % 8) + 1,
    })),
  ].map((r) => ({ ...r, base: byKind.get(r.id) ?? 0 }));

  return rows.filter((r) => r.base > 0).sort((a, b) => b.base - a.base);
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
