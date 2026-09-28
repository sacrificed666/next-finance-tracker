"use client";

import { addMonths, monthDiff, monthOf } from "@/lib/date";
import { expensesByCategory, monthlySeries, rollupToParents } from "@/lib/finance/finmath";
import { convert } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import type { Transaction } from "@/lib/types";

export type ReportPeriod = "month" | "quarter" | "year";

export const PERIOD_MONTHS: Record<ReportPeriod, number> = { month: 1, quarter: 3, year: 12 };

/** The first month of the period that contains `month`. */
export function periodStart(period: ReportPeriod, month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (period === "year") return `${y}-01`;
  if (period === "quarter") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}`;
  return month;
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  byCategory: Map<string, number>;
  byTag: Map<string, number>;
  months: string[];
}

/**
 * One period against the one before it: totals, spending by top-level
 * category and by tag, the largest single expenses, and the months inside.
 */
export function useReport(period: ReportPeriod, anchor: string) {
  const { state } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const length = PERIOD_MONTHS[period];
  const start = periodStart(period, anchor);
  const end = addMonths(start, length - 1);
  const prevStart = addMonths(start, -length);

  const totalsFor = (from: string): PeriodTotals => {
    const months = Array.from({ length }, (_, i) => addMonths(from, i));
    const series = monthlySeries(state.transactions, addMonths(from, length - 1), length, settings);
    const byCategory = new Map<string, number>();
    for (const m of months) {
      for (const [id, v] of rollupToParents(expensesByCategory(state.transactions, m, settings), state.categories)) {
        byCategory.set(id, (byCategory.get(id) ?? 0) + v);
      }
    }
    const byTag = new Map<string, number>();
    for (const tx of state.transactions) {
      if (tx.type !== "expense" || !tx.tags?.length || !months.includes(monthOf(tx.date))) continue;
      for (const tag of tx.tags) byTag.set(tag, (byTag.get(tag) ?? 0) + convert(tx.amount, tx.currency, base, settings.rates));
    }
    const income = series.reduce((s, m) => s + m.income, 0);
    const expense = series.reduce((s, m) => s + m.expense, 0);
    return { income, expense, net: income - expense, byCategory, byTag, months };
  };

  const current = totalsFor(start);
  const previous = totalsFor(prevStart);
  const inPeriod = (tx: Transaction) => monthDiff(start, monthOf(tx.date)) >= 0 && monthDiff(monthOf(tx.date), end) >= 0;
  const largest = state.transactions
    .filter((tx) => tx.type === "expense" && inPeriod(tx))
    .map((tx) => ({ tx, base: convert(tx.amount, tx.currency, base, settings.rates) }))
    .sort((a, b) => b.base - a.base)
    .slice(0, 5);
  // Twelve months ending with the period, for the category trends and the year in review.
  const year = monthlySeries(state.transactions, end, 12, settings);
  const trendOf = (categoryId: string) =>
    year.map((m) => rollupToParents(expensesByCategory(state.transactions, m.month, settings), state.categories).get(categoryId) ?? 0);

  return { start, end, prevStart, current, previous, largest, year, trendOf };
}
