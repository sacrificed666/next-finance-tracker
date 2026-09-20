import type { CoinHolding, Currency } from "./types";

const MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

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
  { id: "whitebit", symbol: "WBT", name: "WhiteBIT Coin" },
  { id: "chainlink", symbol: "LINK", name: "Chainlink" },
  { id: "stellar", symbol: "XLM", name: "Stellar" },
  { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
  { id: "the-open-network", symbol: "TON", name: "Toncoin (Gram)" },
  { id: "sui", symbol: "SUI", name: "Sui" },
  { id: "near", symbol: "NEAR", name: "NEAR Protocol" },
  { id: "polkadot", symbol: "DOT", name: "Polkadot" },
  { id: "shiba-inu", symbol: "SHIB", name: "Shiba Inu" },
  { id: "pepe", symbol: "PEPE", name: "Pepe" },
  { id: "polygon-ecosystem-token", symbol: "POL", name: "Polygon (POL)" },
  { id: "dai", symbol: "DAI", name: "Dai" },
];

export function holdingsValue(holdings: CoinHolding[] | undefined): number {
  if (!holdings) return 0;
  let sum = 0;
  for (const h of holdings) if (h.price && h.quantity > 0) sum += h.quantity * h.price;
  return sum;
}

const COIN_BY_ID = new Map(COINS.map((c) => [c.id, c]));

export function coinInfo(id: string | undefined) {
  return id ? COIN_BY_ID.get(id) : undefined;
}

export interface CoinQuote {
  price: number;
  icon?: string;
}

export type CoinQuotes = Record<string, CoinQuote>;

export async function fetchCoinQuotes(
  ids: string[],
  currency: Currency,
): Promise<CoinQuotes> {
  const wanted = [...new Set(ids)].filter((id) => COIN_BY_ID.has(id));
  if (wanted.length === 0) return {};
  const vs = currency.toLowerCase();
  const url =
    `${MARKETS_URL}?vs_currency=${vs}&ids=${wanted.join(",")}` +
    `&per_page=${wanted.length}&sparkline=false&price_change_percentage=`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    throw new Error("CoinGecko is rate-limiting this address — try again in a minute.");
  }
  if (!res.ok) throw new Error(`CoinGecko responded with ${res.status}`);
  const body = (await res.json()) as Array<{
    id?: string;
    image?: string;
    current_price?: number;
  }>;
  if (!Array.isArray(body)) throw new Error("CoinGecko returned an unexpected shape.");
  const quotes: CoinQuotes = {};
  for (const row of body) {
    if (!row?.id || !COIN_BY_ID.has(row.id)) continue;
    const price = row.current_price;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
    const icon =
      typeof row.image === "string" && /^https:\/\/[\w.-]*coingecko\.com\//.test(row.image) ? row.image : undefined;
    quotes[row.id] = { price, icon };
  }
  return quotes;
}
