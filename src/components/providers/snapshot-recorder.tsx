"use client";

import { useEffect } from "react";
import { todayISO } from "@/lib/date";
import { netWorth } from "@/lib/finance/finmath";
import { convert } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import type { NetWorthSnapshot } from "@/lib/types";

/**
 * Keeps one net-worth snapshot per day, in hryvnias with that day's rates.
 * Balances can be recomputed for any past date from transactions, but market
 * prices (coins, game items, fund NAV) cannot — the snapshots are what makes
 * the history true.
 */
export function SnapshotRecorder() {
  const { state, hydrated, loadError, quietUpdate } = useStore();
  const today = todayISO();
  const { settings } = state;
  const worth = netWorth(state, today);
  const uah = (v: number) => Math.round(convert(v, settings.baseCurrency, "UAH", settings.rates) * 100) / 100;
  const snapshot: NetWorthSnapshot = {
    date: today,
    total: uah(worth.total),
    savings: uah(worth.savings),
    investments: uah(worth.investments),
    debts: uah(worth.debts),
    receivables: uah(worth.receivables),
    rates: { ...settings.rates },
  };
  const stored = state.snapshots.find((s) => s.date === today);
  const changed =
    !stored ||
    Math.abs(stored.total - snapshot.total) >= 1 ||
    Math.abs(stored.investments - snapshot.investments) >= 1 ||
    Math.abs(stored.debts - snapshot.debts) >= 1;
  const hasData = state.savings.length > 0 || state.investments.length > 0 || state.debts.length > 0;

  useEffect(() => {
    if (!hydrated || loadError || !hasData || !changed) return;
    quietUpdate((s) => ({ ...s, snapshots: [...s.snapshots.filter((x) => x.date !== snapshot.date), snapshot] }));
    // The snapshot is rebuilt every render; only its figures decide whether to store it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loadError, hasData, changed, snapshot.total, snapshot.investments, snapshot.debts, quietUpdate]);

  return null;
}
