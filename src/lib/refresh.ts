import { fetchCoinQuotes, type CoinQuote } from "./crypto";
import { fetchInzhurQuotes, type InzhurQuote } from "./inzhur";
import { fetchLiveRates } from "./rates";
import { convert } from "./money";
import type { AppState, Currency } from "./types";

export interface RefreshOutcome {
  applied: boolean;
  errors: string[];
}

export function pricedPositions(state: AppState) {
  const coinInvestments = state.investments.filter(
    (i) => i.kind === "crypto" && i.coin && (i.quantity ?? 0) > 0,
  );
  const inzhurInvestments = state.investments.filter(
    (i) => i.kind === "inzhur" && i.fund && (i.quantity ?? 0) > 0,
  );
  const coinAccounts = state.savings.filter(
    (a) => a.kind === "crypto" && (a.holdings?.length ?? 0) > 0,
  );
  return { coinInvestments, inzhurInvestments, coinAccounts };
}

export function lastPricedAt(state: AppState): string | undefined {
  const { coinInvestments, inzhurInvestments, coinAccounts } = pricedPositions(state);
  return [...coinInvestments, ...inzhurInvestments, ...coinAccounts].reduce<string | undefined>(
    (newest, item) => (item.pricedAt && (!newest || item.pricedAt > newest) ? item.pricedAt : newest),
    undefined,
  );
}

export async function loadCoinQuotes(
  wanted: Array<{ coin: string; currency: Currency }>,
  errors: string[],
): Promise<Map<string, CoinQuote>> {
  const quotes = new Map<string, CoinQuote>();
  const byCurrency = new Map<Currency, string[]>();
  for (const { coin, currency } of wanted) {
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), coin]);
  }
  for (const [currency, ids] of byCurrency) {
    try {
      const got = await fetchCoinQuotes(ids, currency);
      for (const [id, quote] of Object.entries(got)) quotes.set(`${currency}:${id}`, quote);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Cryptocurrency prices are unavailable.");
    }
  }
  return quotes;
}

function applyQuotes(
  state: AppState,
  coins: Map<string, CoinQuote>,
  funds: Map<string, InzhurQuote>,
  pricedAt: string,
): AppState {
  return {
    ...state,
    savings: state.savings.map((acc) => {
      if (acc.kind !== "crypto" || !acc.holdings?.length) return acc;
      let touched = false;
      const holdings = acc.holdings.map((h) => {
        const quote = coins.get(`${acc.currency}:${h.coin}`);
        if (!quote) return h;
        touched = true;
        return { ...h, price: quote.price, icon: quote.icon ?? h.icon };
      });
      return touched ? { ...acc, holdings, pricedAt } : acc;
    }),
    investments: state.investments.map((inv) => {
      if (inv.kind === "crypto" && inv.coin) {
        const quote = coins.get(`${inv.currency}:${inv.coin}`);
        if (!quote) return inv;
        return {
          ...inv,
          marketValue: (inv.quantity ?? 0) * quote.price,
          coinIcon: quote.icon ?? inv.coinIcon,
          pricedAt,
        };
      }
      if (inv.kind === "inzhur" && inv.fund) {
        const quote = funds.get(inv.fund);
        if (!quote) return inv;
        const perUnit = convert(quote.navPerCertificate, "UAH", inv.currency, state.settings.rates);
        return {
          ...inv,
          marketValue: (inv.quantity ?? 0) * perUnit,
          annualRatePct: quote.projectedYieldPct,
          pricedAt,
        };
      }
      return inv;
    }),
  };
}

export async function fetchPriceUpdate(
  state: AppState,
): Promise<{ apply: (s: AppState) => AppState; errors: string[]; changed: boolean }> {
  const { coinInvestments, inzhurInvestments, coinAccounts } = pricedPositions(state);
  const errors: string[] = [];
  if (coinInvestments.length + inzhurInvestments.length + coinAccounts.length === 0) {
    return { apply: (s) => s, errors, changed: false };
  }

  const coins = await loadCoinQuotes(
    [
      ...coinInvestments.map((inv) => ({ coin: inv.coin!, currency: inv.currency })),
      ...coinAccounts.flatMap((acc) =>
        (acc.holdings ?? []).map((h) => ({ coin: h.coin, currency: acc.currency })),
      ),
    ],
    errors,
  );

  const funds = new Map<string, InzhurQuote>();
  if (inzhurInvestments.length > 0) {
    try {
      const res = await fetchInzhurQuotes([...new Set(inzhurInvestments.map((i) => i.fund!))]);
      for (const quote of res.quotes) funds.set(quote.id, quote);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Inzhur is unavailable.");
    }
  }

  const changed = coins.size > 0 || funds.size > 0;
  const pricedAt = new Date().toISOString();
  return { apply: (s) => (changed ? applyQuotes(s, coins, funds, pricedAt) : s), errors, changed };
}

export async function fetchRatesUpdate(): Promise<(s: AppState) => AppState> {
  const fetched = await fetchLiveRates();
  const updatedAt = new Date().toISOString();
  return (s) => ({
    ...s,
    settings: {
      ...s.settings,
      rates: { USD: fetched.USD.buy, EUR: fetched.EUR.buy },
      ratesMeta: { USD: fetched.USD, EUR: fetched.EUR },
      ratesSource: fetched.source,
      ratesUpdatedAt: updatedAt,
    },
  });
}

export const HOUR_MS = 60 * 60 * 1000;

export function msUntilNextHour(now = Date.now()): number {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  return next.getTime() + HOUR_MS - now;
}

export function isStale(iso: string | undefined, now = Date.now()): boolean {
  if (!iso) return true;
  const at = Date.parse(iso);
  return !Number.isFinite(at) || now - at >= HOUR_MS;
}
