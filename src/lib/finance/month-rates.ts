import { monthOf } from "@/lib/date";
import type { AppState, Settings } from "@/lib/types";

export type MonthRates = NonNullable<Settings["monthRates"]>;

const MONTH_RE = /^\d{4}-\d{2}$/;

export function monthsNeedingRates(state: AppState, currentMonth: string, limit = 12): string[] {
  const foreign =
    state.settings.baseCurrency !== "UAH" ||
    state.transactions.some((tx) => tx.currency !== "UAH") ||
    state.budgets.some((b) => b.currency !== "UAH");
  if (!foreign) return [];
  const have = state.settings.monthRates ?? {};
  const months = new Set<string>();
  for (const tx of state.transactions) {
    const month = monthOf(tx.date);
    if (month < currentMonth && !have[month]) months.add(month);
  }
  return [...months].sort().reverse().slice(0, limit);
}

export function averageRate(rows: Array<{ rate_per_unit?: number; rate?: number }>): number | null {
  const rates = rows.map((r) => r.rate_per_unit ?? r.rate).filter((v): v is number => typeof v === "number" && v > 0);
  if (rates.length === 0) return null;
  return Math.round((rates.reduce((sum, v) => sum + v, 0) / rates.length) * 10_000) / 10_000;
}

export function normalizeMonthRates(value: unknown): MonthRates | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: MonthRates = {};
  for (const [month, rates] of Object.entries(value as Record<string, unknown>).slice(-600)) {
    const r = rates as { USD?: unknown; EUR?: unknown } | null;
    if (!MONTH_RE.test(month) || !r) continue;
    const usd = Number(r.USD);
    const eur = Number(r.EUR);
    if (Number.isFinite(usd) && usd > 0 && Number.isFinite(eur) && eur > 0) out[month] = { USD: usd, EUR: eur };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
