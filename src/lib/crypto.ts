/**
 * Live crypto prices from CoinGecko's public endpoint — free, keyless and
 * CORS-enabled, like the exchange-rate sources in `rates.ts`. It quotes
 * directly in ₴ / $ / €, so a holding is priced in its own currency rather than
 * converted twice.
 *
 * Rate limits are per-IP and generous but real (a handful of calls a minute),
 * which is why prices are fetched on an explicit refresh and then stored on the
 * position — never per render.
 */

import type { Currency } from "./types";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";

/**
 * The ten largest coins by market capitalisation, in that order. A fixed list
 * rather than a live "top 10" query: the ranking below the first few reshuffles
 * constantly, and a picker whose options move between visits is a worse trade
 * than a list that occasionally needs a line edited here.
 */
export const COINS: Array<{ id: string; symbol: string; name: string }> = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "cardano", symbol: "ADA", name: "Cardano" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "tron", symbol: "TRX", name: "TRON" },
];

const COIN_BY_ID = new Map(COINS.map((c) => [c.id, c]));

export function coinInfo(id: string | undefined) {
  return id ? COIN_BY_ID.get(id) : undefined;
}

/** price per unit, keyed by coin id, in `currency` */
export type CoinPrices = Record<string, number>;

/**
 * One request for every coin asked about. Coins the response does not price are
 * simply absent from the result — the caller leaves those positions at whatever
 * they were last worth rather than zeroing them.
 */
export async function fetchCoinPrices(
  ids: string[],
  currency: Currency,
): Promise<CoinPrices> {
  const wanted = [...new Set(ids)].filter((id) => COIN_BY_ID.has(id));
  if (wanted.length === 0) return {};
  const vs = currency.toLowerCase();
  const url = `${PRICE_URL}?ids=${wanted.join(",")}&vs_currencies=${vs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    throw new Error("CoinGecko is rate-limiting this address — try again in a minute.");
  }
  if (!res.ok) throw new Error(`CoinGecko responded with ${res.status}`);
  const body = (await res.json()) as Record<string, Record<string, number>>;
  const prices: CoinPrices = {};
  for (const id of wanted) {
    const price = body?.[id]?.[vs];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      prices[id] = price;
    }
  }
  return prices;
}
