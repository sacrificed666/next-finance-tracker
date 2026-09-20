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
  accountColorSlot,
  INVESTMENT_KINDS,
  investmentColorSlot,
  investmentKind,
  valuationOf,
} from "./constants";
import { convert } from "./money";
import { holdingsValue } from "./crypto";
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
  invested: number;
  value: number;
  accrued: number;
  paidOut: number;
}

export function investmentAt(inv: Investment, atISO: string): InvestmentSnapshot {
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
  const t = yearsBetween(inv.startDate, asOf);
  const r = inv.annualRatePct / 100;
  const f = FREQ_PER_YEAR[inv.compoundingFreq];
  const c = inv.monthlyContribution ?? 0;
  const n = wholeMonthsBetween(inv.startDate, asOf);
  const invested = inv.principal + c * n;

  if (t <= 0) return { invested: inv.principal, value: inv.principal, accrued: 0, paidOut: 0 };

  if (inv.compounding === "reinvest") {
    const growth = Math.pow(1 + r / f, f * t);
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

  const contribInterest = c * r * ((n * (n - 1)) / 2 / 12);
  const paidOut = inv.principal * r * t + contribInterest;
  return { invested, value: invested, accrued: 0, paidOut };
}

export function projectedSnapshot(
  inv: Investment,
  todayISO: string,
  atISO: string,
): { value: number; paidOut: number } {
  if (valuationOf(inv.kind) !== "market") {
    const snap = investmentAt(inv, atISO);
    return { value: snap.value, paidOut: snap.paidOut };
  }

  const end = inv.endDate && atISO > inv.endDate ? inv.endDate : atISO;
  const known = investmentAt(inv, end).value;
  const years = Math.max(0, yearsBetween(todayISO, end));
  const months = wholeMonthsBetween(todayISO, end);
  const r = inv.annualRatePct / 100;
  const c = inv.monthlyContribution ?? 0;
  if (r === 0 && c === 0) return { value: known, paidOut: 0 };

  if (inv.compounding === "payout") {
    const value = known + c * months;
    const paidOut = known * r * years + c * r * ((months * (months - 1)) / 2 / 12);
    return { value, paidOut };
  }

  const grown = known * Math.pow(1 + r, years);
  if (c === 0) return { value: grown, paidOut: 0 };
  const im = Math.pow(1 + r, 1 / 12) - 1;
  const contribFV = im === 0 ? c * months : c * ((Math.pow(1 + im, months) - 1) / im);
  return { value: grown + contribFV, paidOut: 0 };
}


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
  debts: number;
  assets: number;
  total: number;
}

export function debtsTotal(state: AppState): number {
  const { settings } = state;
  return state.debts.reduce(
    (sum, d) => sum + convert(d.balance, d.currency, settings.baseCurrency, settings.rates),
    0,
  );
}

export function accountBalance(
  account: SavingsAccount,
  transactions: Transaction[],
  upToISO?: string,
): number {
  let balance = account.openingBalance + holdingsValue(account.holdings);
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

export function accountBalances(
  state: AppState,
  upToISO?: string,
): Map<string, number> {
  const balances = new Map(
    state.savings.map((acc) => [acc.id, acc.openingBalance + holdingsValue(acc.holdings)]),
  );
  const add = (id: string | undefined, delta: number) => {
    if (!id) return;
    const current = balances.get(id);
    if (current === undefined) return;
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
  month: string;
  savings: number;
  investments: number;
  debt: number;
  total: number;
  net: number;
}

export interface ProjectionEvent {
  month: string;
  amount: number;
}

export interface ProjectionOptions {
  savingsReturnPct?: number;
  events?: ProjectionEvent[];
  includeDebts?: boolean;
}

export function debtBalances(state: AppState, horizonMonths: number): number[] {
  const { settings } = state;
  const out = new Array(horizonMonths + 1).fill(0);
  for (const debt of state.debts) {
    const rate = (debt.annualRatePct ?? 0) / 100 / 12;
    const payment = debt.monthlyPayment ?? 0;
    let balance = debt.balance;
    for (let m = 0; m <= horizonMonths; m++) {
      out[m] += convert(Math.max(0, balance), debt.currency, settings.baseCurrency, settings.rates);
      if (payment > 0 && balance > 0) balance = Math.max(0, balance + balance * rate - payment);
    }
  }
  return out;
}

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
  const eventsByMonth = new Map<string, number>();
  for (const event of opts.events ?? []) {
    eventsByMonth.set(event.month, (eventsByMonth.get(event.month) ?? 0) + event.amount);
  }
  const debts = opts.includeDebts ? debtBalances(state, horizonMonths) : null;

  const balancesNow = accountBalances(state, todayISO);
  const savingsNow = state.savings.reduce(
    (sum, acc) =>
      sum +
      convert(balancesNow.get(acc.id) ?? 0, acc.currency, settings.baseCurrency, settings.rates),
    0,
  );

  const investmentsAt = (m: number) => {
    const atISO = dateInMonth(addMonths(startMonth, m), day);
    let value = 0;
    let paidOut = 0;
    for (const inv of state.investments) {
      const snap = projectedSnapshot(inv, todayISO, atISO);
      value += convert(snap.value, inv.currency, settings.baseCurrency, settings.rates);
      paidOut += convert(snap.paidOut, inv.currency, settings.baseCurrency, settings.rates);
    }
    return { value, paidOut };
  };

  const first = investmentsAt(0);
  const firstDebt = debts ? debts[0] : 0;
  const points: ProjectionPoint[] = [
    {
      month: startMonth,
      savings: savingsNow,
      investments: first.value,
      debt: firstDebt,
      total: savingsNow + first.value,
      net: savingsNow + first.value - firstDebt,
    },
  ];

  let savings = savingsNow;
  let prevPaidOut = first.paidOut;
  for (let m = 1; m <= horizonMonths; m++) {
    const inv = investmentsAt(m);
    const month = addMonths(startMonth, m);
    const payoutInflow = Math.max(0, inv.paidOut - prevPaidOut);
    prevPaidOut = inv.paidOut;
    savings = savings * (1 + monthlyReturn) + payoutInflow;
    savings += eventsByMonth.get(month) ?? 0;
    const debt = debts ? debts[m] : 0;
    points.push({
      month,
      savings,
      investments: inv.value,
      debt,
      total: savings + inv.value,
      net: savings + inv.value - debt,
    });
  }
  return points;
}

export interface MonthTotals {
  income: number;
  expense: number;
  net: number;
}

export function monthTotals(
  transactions: Transaction[],
  month: string,
  settings: Settings,
): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.type === "transfer" || monthOf(tx.date) !== month) continue;
    const v = convert(tx.amount, tx.currency, settings.baseCurrency, settings.rates);
    if (tx.type === "income") income += v;
    else expense += v;
  }
  return { income, expense, net: income - expense };
}

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
  const result = [...byMonth.values()];
  for (const bucket of result) bucket.net = bucket.income - bucket.expense;
  return result;
}

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

export function breakdownTotal(b: IncomeBreakdown): number {
  return b.days * b.dailyRate + b.premium + b.compensations - b.cutoffs;
}

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

export function subscriptionMonthlyCost(
  sub: Subscription,
  to: Currency,
  settings: Settings,
): number {
  const perMonth = sub.period === "yearly" ? sub.price / 12 : sub.price;
  return convert(perMonth, sub.currency, to, settings.rates);
}

export function subscriptionBillsIn(sub: Subscription, month: string): boolean {
  return sub.active && sub.startMonth <= month && (!sub.endMonth || sub.endMonth >= month);
}

export type SubscriptionStatus = "active" | "upcoming" | "ended" | "paused";

export function subscriptionStatus(sub: Subscription, month: string): SubscriptionStatus {
  if (!sub.active) return "paused";
  if (sub.startMonth > month) return "upcoming";
  if (sub.endMonth && sub.endMonth < month) return "ended";
  return "active";
}

export function subscriptionsMonthlyTotal(
  subscriptions: Subscription[],
  to: Currency,
  settings: Settings,
): number {
  return subscriptions
    .filter((s) => s.active)
    .reduce((sum, s) => sum + subscriptionMonthlyCost(s, to, settings), 0);
}

export interface Holding {
  id: string;
  label: string;
  icon: string;
  currency: Currency;
  native: number;
  base: number;
  kind: "account" | "investment";
}

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
  months: number;
  finalMonth: string;
  interest: number;
  neverPaysOff: boolean;
}

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

export function taxPaid(
  transactions: Transaction[],
  fromMonth: string,
  toMonth: string,
  settings: Settings,
): { tax: number; vat: number; gross: number; entries: number } {
  let tax = 0;
  let vat = 0;
  let gross = 0;
  let entries = 0;
  const to = settings.baseCurrency;
  for (const tx of transactions) {
    if (tx.type !== "income" || !tx.tax) continue;
    const m = monthOf(tx.date);
    if (m < fromMonth || m > toMonth) continue;
    const vatPct = tx.tax.vatPct ?? 0;
    const vatNative = vatPct > 0 ? tx.tax.gross - tx.tax.gross / (1 + vatPct / 100) : 0;
    const deducted = tx.tax.gross - tx.amount;
    vat += convert(vatNative, tx.currency, to, settings.rates);
    tax += convert(deducted - vatNative, tx.currency, to, settings.rates);
    gross += convert(tx.tax.gross, tx.currency, to, settings.rates);
    entries++;
  }
  return { tax, vat, gross, entries };
}


export function netWorthByKind(
  state: AppState,
  todayISO: string,
): Array<{ id: string; label: string; icon: string; base: number; colorSlot: number }> {
  const { settings } = state;
  const balances = accountBalances(state, todayISO);

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

  const rows = [
    ...ACCOUNT_KINDS.map((k) => ({
      id: `acc:${k.value}`,
      label: k.label,
      icon: k.icon,
      colorSlot: accountColorSlot(k.value),
    })),
    ...INVESTMENT_KINDS.map((k) => ({
      id: `inv:${k.value}`,
      label: k.label,
      icon: k.icon,
      colorSlot: investmentColorSlot(k.value),
    })),
  ].map((r) => ({ ...r, base: byKind.get(r.id) ?? 0 }));

  return rows.filter((r) => r.base > 0).sort((a, b) => b.base - a.base);
}

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

export function rollupToParents(
  byCategory: Map<string, number>,
  categories: Array<{ id: string; parentId?: string }>,
): Map<string, number> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const out = new Map<string, number>();
  for (const [id, value] of byCategory) {
    const parent = parentOf.get(id);
    const key = parent && parentOf.has(parent) ? parent : id;
    out.set(key, (out.get(key) ?? 0) + value);
  }
  return new Map([...out.entries()].sort((a, b) => b[1] - a[1]));
}
