"use client";

import { CURRENCIES } from "@/lib/constants";
import { currentMonth, todayISO } from "@/lib/date";
import { buildProjection, holdings, monthlySeries } from "@/lib/finance/finmath";
import { convert } from "@/lib/finance/money";
import { useStore } from "@/lib/state/store";
import type { Currency, PlannedEvent } from "@/lib/types";

export const INFLATION_PCT: Record<Currency, number> = { UAH: 10, USD: 3, EUR: 2.5 };
export const SAFE_WITHDRAWAL_PCT = 4;

export interface ForecastInputs {
  years: number;
  view: Currency;
  returnPct: number;
  spreadPct: number;
  inflationOn: boolean;
  withDebts: boolean;
  events: PlannedEvent[];
}

/**
 * Base, cautious and optimistic projections plus everything the page derives
 * from them. `show(value, i)` converts a base-currency value at month `i` into
 * the viewing currency, deflated when "real terms" is on.
 */
export function useForecast(inputs: ForecastInputs) {
  const { state } = useStore();
  const { settings } = state;
  const base = settings.baseCurrency;
  const today = todayISO();
  const startMonth = currentMonth();
  const { years, view, returnPct, spreadPct, inflationOn, withDebts, events } = inputs;

  const projectionEvents = events.map((e) => ({
    month: e.month,
    amount: convert(e.amount, e.currency, base, settings.rates),
  }));

  // Inflation weighted by the currencies you actually hold.
  const inflationMix = (() => {
    const weight = Object.fromEntries(CURRENCIES.map((c) => [c, 0])) as Record<Currency, number>;
    for (const h of holdings(state, today)) weight[h.currency] += Math.max(0, h.base);
    const total = CURRENCIES.reduce((sum, c) => sum + weight[c], 0);
    if (total <= 0) return { pct: INFLATION_PCT[base], shares: null };
    const pct = CURRENCIES.reduce((sum, c) => sum + (weight[c] / total) * INFLATION_PCT[c], 0);
    return {
      pct,
      shares: CURRENCIES.filter((c) => weight[c] > 0).map((c) => ({ currency: c, share: weight[c] / total })),
    };
  })();

  const months = years * 12;
  const projectionFor = (returns: number) =>
    buildProjection(state, today, months, {
      savingsReturnPct: returns,
      events: projectionEvents,
      includeDebts: withDebts,
    });

  const projection = projectionFor(returnPct);
  const low = projectionFor(Math.max(0, returnPct - spreadPct));
  const high = projectionFor(returnPct + spreadPct);

  const inflMonthly = inflationOn ? inflationMix.pct / 100 / 12 : 0;
  const show = (baseValue: number, i: number) =>
    convert(baseValue, base, view, settings.rates) / Math.pow(1 + inflMonthly, i);

  const assetsNow = projection[0].net;
  const nowTotal = show(assetsNow, 0);
  const endPoint = projection[projection.length - 1];
  const endTotal = show(endPoint.net, projection.length - 1);
  const endLow = show(low[low.length - 1].net, low.length - 1);
  const endHigh = show(high[high.length - 1].net, high.length - 1);

  const points = projection.map((p, i) => ({ label: p.month, a: show(p.savings, i), b: show(p.investments, i) }));

  const spendSeries = monthlySeries(state.transactions, startMonth, 6, settings).filter((m) => m.expense > 0);
  const avgSpend = spendSeries.length > 0 ? spendSeries.reduce((s, m) => s + m.expense, 0) / spendSeries.length : 0;
  const freedomIndex =
    avgSpend > 0 ? projection.findIndex((p) => (p.total * SAFE_WITHDRAWAL_PCT) / 100 / 12 >= avgSpend) : -1;
  const freedomMonth = freedomIndex >= 0 ? projection[freedomIndex].month : null;
  const passiveNow = (projection[0].total * SAFE_WITHDRAWAL_PCT) / 100 / 12;
  const coverNow = avgSpend > 0 ? Math.min(100, (passiveNow / avgSpend) * 100) : 0;

  const contributionSplit = (() => {
    const start = nowTotal;
    const investmentTopUps = state.investments.reduce(
      (sum, inv) => sum + convert(inv.monthlyContribution ?? 0, inv.currency, base, settings.rates),
      0,
    );
    const deposits = show(investmentTopUps * months, projection.length - 1);
    const growth = Math.max(0, endTotal - start - deposits);
    const total = Math.max(1e-9, start + deposits + growth);
    return {
      start,
      deposits,
      growth,
      startPct: (start / total) * 100,
      depositPct: (deposits / total) * 100,
      growthPct: (growth / total) * 100,
    };
  })();

  return {
    state,
    settings,
    base,
    startMonth,
    inflationMix,
    projection,
    projectionFor,
    show,
    assetsNow,
    nowTotal,
    endPoint,
    endTotal,
    endLow,
    endHigh,
    points,
    avgSpend,
    freedomMonth,
    coverNow,
    contributionSplit,
  };
}

export type Forecast = ReturnType<typeof useForecast>;
