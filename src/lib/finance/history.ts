import { addMonths, dateInMonth, monthOf } from "@/lib/date";
import { netWorth } from "@/lib/finance/finmath";
import type { AppState, Currency, NetWorthSnapshot } from "@/lib/types";

/** A snapshot's hryvnia figure in another currency, at the rates of the snapshot's own day. */
export function fromSnapshot(value: number, snap: NetWorthSnapshot, currency: Currency): number {
  return currency === "UAH" ? value : value / snap.rates[currency];
}

/**
 * Net worth at the end of each of the last `months` months, the last point
 * being today. A month with a stored snapshot uses its latest one — that
 * carries the market prices of the time; other months are rebuilt from the
 * transactions, which knows balances but only today's prices.
 */
export function worthHistory(state: AppState, today: string, months = 12): number[] {
  const base = state.settings.baseCurrency;
  const month = monthOf(today);
  const day = Number(today.slice(8));
  const lastSnapshotIn = new Map<string, NetWorthSnapshot>();
  for (const snap of state.snapshots) lastSnapshotIn.set(monthOf(snap.date), snap);
  return Array.from({ length: months }, (_, i) => {
    if (i === months - 1) return netWorth(state, today).total;
    const m = addMonths(month, i - (months - 1));
    const snap = lastSnapshotIn.get(m);
    return snap ? fromSnapshot(snap.total, snap, base) : netWorth(state, dateInMonth(m, day)).total;
  });
}

/** The highest net worth ever recorded, if there is a history to speak of. */
export function worthPeak(state: AppState): { date: string; total: number } | null {
  if (state.snapshots.length < 2) return null;
  const base = state.settings.baseCurrency;
  let best: { date: string; total: number } | null = null;
  for (const snap of state.snapshots) {
    const total = fromSnapshot(snap.total, snap, base);
    if (!best || total > best.total) best = { date: snap.date, total };
  }
  return best;
}
