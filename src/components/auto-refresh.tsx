"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import {
  fetchPriceUpdate,
  fetchRatesUpdate,
  HOUR_MS,
  isStale,
  lastPricedAt,
  msUntilNextHour,
  pricedPositions,
} from "@/lib/refresh";
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

export function AutoRefresh() {
  const { state, update, hydrated } = useStore();
  const latest = useRef<AppState>(state);
  const busy = useRef(false);

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

    const first = setTimeout(refreshIfStale, 2_000);
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
  }, [hydrated, run]);

  return null;
}
