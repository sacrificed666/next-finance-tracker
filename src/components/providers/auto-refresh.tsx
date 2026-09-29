"use client";

import { useCallback, useEffect, useRef } from "react";
import { currentMonth } from "@/lib/date";
import { monthsNeedingRates, type MonthRates } from "@/lib/finance/month-rates";
import { useStore } from "@/lib/state/store";
import {
  fetchPriceUpdate,
  fetchRatesUpdate,
  HOUR_MS,
  isStale,
  lastPricedAt,
  msUntilNextHour,
  pricedPositions,
} from "@/lib/market/refresh";
import type { AppState } from "@/lib/types";

const CLAIM_KEY = "finance-tracker:refreshed-hour";

function hourKey(now = new Date()): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
}

function claimThisHour(): boolean {
  const key = hourKey();
  try {
    if (localStorage.getItem(CLAIM_KEY) === key) return false;
    localStorage.setItem(CLAIM_KEY, key);
  } catch {
    return true;
  }
  return true;
}

async function fetchMonthRates(months: string[]): Promise<MonthRates> {
  const found: MonthRates = {};
  for (const month of months) {
    const res = await fetch(`/api/nbu-rate?month=${month}`).catch(() => null);
    if (!res?.ok) break;
    const rates = (await res.json().catch(() => null)) as { USD?: number; EUR?: number } | null;
    if (rates?.USD && rates.EUR) found[month] = { USD: rates.USD, EUR: rates.EUR };
  }
  return found;
}

export function AutoRefresh() {
  const { state, update, quietUpdate, hydrated } = useStore();
  const latest = useRef<AppState>(state);
  const busy = useRef(false);
  const fillingRates = useRef(false);

  const fillMonthRates = useCallback(async () => {
    const missing = monthsNeedingRates(latest.current, currentMonth());
    if (missing.length === 0 || fillingRates.current) return;
    fillingRates.current = true;
    try {
      const found = await fetchMonthRates(missing);
      if (Object.keys(found).length === 0) return;
      quietUpdate((s) => ({ ...s, settings: { ...s.settings, monthRates: { ...s.settings.monthRates, ...found } } }));
    } finally {
      fillingRates.current = false;
    }
  }, [quietUpdate]);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const current = latest.current;
      const { coinAccounts, coinInvestments, inzhurInvestments } = pricedPositions(current);
      const hasPriced = coinAccounts.length + coinInvestments.length + inzhurInvestments.length > 0;

      const [rates, prices] = await Promise.all([
        fetchRatesUpdate().catch(() => null),
        hasPriced ? fetchPriceUpdate(current).catch(() => null) : Promise.resolve(null),
      ]);

      if (!rates && !prices?.changed) return;
      update((s) => {
        let next = s;
        if (rates) next = rates(next);
        if (prices?.changed) next = prices.apply(next);
        return next;
      });
    } finally {
      busy.current = false;
    }
  }, [update]);

  useEffect(() => {
    if (!hydrated) return;

    const refreshIfStale = () => {
      const current = latest.current;
      const stale =
        isStale(current.settings.ratesUpdatedAt) || isStale(lastPricedAt(current));
      if (stale && claimThisHour()) void run();
    };

    const first = setTimeout(() => {
      refreshIfStale();
      void fillMonthRates();
    }, 2_000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const onTheHour = setTimeout(() => {
      if (claimThisHour()) void run();
      interval = setInterval(() => {
        if (claimThisHour()) void run();
      }, HOUR_MS);
    }, msUntilNextHour());

    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(first);
      clearTimeout(onTheHour);
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, run, fillMonthRates]);

  return null;
}
