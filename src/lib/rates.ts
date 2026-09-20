export interface BuySell {
  buy: number;
  sell: number;
}

export interface FetchedRates {
  USD: BuySell;
  EUR: BuySell;
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

function monoPair(row: MonoRow | undefined): BuySell | null {
  if (!row) return null;
  if (row.rateBuy && row.rateSell) return { buy: row.rateBuy, sell: row.rateSell };
  if (row.rateCross) return { buy: row.rateCross, sell: row.rateCross };
  return null;
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
  const usd = monoPair(find(ISO_USD));
  const eur = monoPair(find(ISO_EUR));
  if (!usd || !eur) {
    throw new Error("Monobank response has no USD/EUR rates");
  }
  return { USD: usd, EUR: eur, source: "monobank" };
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
  return {
    USD: { buy: usd, sell: usd },
    EUR: { buy: eur, sell: eur },
    source: "nbu",
  };
}

export async function fetchLiveRates(): Promise<FetchedRates> {
  try {
    return await fetchMonobank();
  } catch {
    return await fetchNbu();
  }
}
