/**
 * Live exchange-rate sources, both free, keyless, and CORS-enabled:
 * - Monobank (primary): buy/sell card rates, matches typical personal
 *   conversion; rate-limited to ~1 request / 5 min per IP (429 on excess).
 * - NBU (fallback): official daily rate.
 * Conversion in the app uses the bank BUY rate (what you get selling
 * foreign currency), which is how the user's own spreadsheets convert.
 */

export interface FetchedRates {
  USD: { buy: number; sell: number };
  EUR: { buy: number; sell: number };
  source: "monobank" | "nbu";
}

const MONOBANK_URL = "https://api.monobank.ua/bank/currency";
const NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json";

const ISO_USD = 840;
const ISO_EUR = 978;
const ISO_UAH = 980;

interface MonoRow {
  currencyCodeA?: number;
  currencyCodeB?: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

async function fetchMonobank(): Promise<FetchedRates> {
  const res = await fetch(MONOBANK_URL, { cache: "no-store" });
  if (res.status === 429) {
    throw new Error("Monobank rate limit hit (1 request / 5 min) — try again later.");
  }
  if (!res.ok) throw new Error(`Monobank responded with ${res.status}`);
  const rows = (await res.json()) as MonoRow[];
  if (!Array.isArray(rows)) throw new Error("Unexpected Monobank response");
  const find = (code: number) =>
    rows.find((r) => r.currencyCodeA === code && r.currencyCodeB === ISO_UAH);
  const usd = find(ISO_USD);
  const eur = find(ISO_EUR);
  if (!usd?.rateBuy || !usd.rateSell || !eur?.rateBuy || !eur.rateSell) {
    throw new Error("Monobank response has no USD/EUR buy-sell rates");
  }
  return {
    USD: { buy: usd.rateBuy, sell: usd.rateSell },
    EUR: { buy: eur.rateBuy, sell: eur.rateSell },
    source: "monobank",
  };
}

interface NbuRow {
  cc?: string;
  rate?: number;
}

async function fetchNbu(): Promise<FetchedRates> {
  const res = await fetch(NBU_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`NBU responded with ${res.status}`);
  const rows = (await res.json()) as NbuRow[];
  if (!Array.isArray(rows)) throw new Error("Unexpected NBU response");
  const find = (cc: string) => rows.find((r) => r.cc === cc)?.rate;
  const usd = find("USD");
  const eur = find("EUR");
  if (typeof usd !== "number" || typeof eur !== "number") {
    throw new Error("NBU response has no USD/EUR rates");
  }
  // official rate has no spread — use it for both sides
  return {
    USD: { buy: usd, sell: usd },
    EUR: { buy: eur, sell: eur },
    source: "nbu",
  };
}

/** Monobank first, NBU as fallback; throws only when both fail */
export async function fetchLiveRates(): Promise<FetchedRates> {
  try {
    return await fetchMonobank();
  } catch {
    return await fetchNbu();
  }
}
