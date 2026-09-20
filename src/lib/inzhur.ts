export type InzhurIncome = "dividends" | "growth";

export interface InzhurFund {
  id: string;
  slug: string;
  name: string;
  themeKey: string;
  accent: string;
  income: InzhurIncome;
  linkedCurrency: "USD" | "UAH";
  projectedYieldPct: number;
  projectedYieldMaxPct?: number;
}

export const INZHUR_FUNDS: InzhurFund[] = [
  {
    id: "inzhur-reit",
    slug: "inzhur-reit",
    name: "Inzhur REIT",
    themeKey: "inzhur.theme.realEstate",
    accent: "#1f6feb",
    income: "dividends",
    linkedCurrency: "USD",
    projectedYieldPct: 9.5,
  },
  {
    id: "inzhur-energy",
    slug: "inzhur-energy",
    name: "Inzhur Energy",
    themeKey: "inzhur.theme.energy",
    accent: "#f0b429",
    income: "growth",
    linkedCurrency: "USD",
    projectedYieldPct: 15,
  },
  {
    id: "inzhur-miltech",
    slug: "inzhur-miltech",
    name: "Inzhur MilTech",
    themeKey: "inzhur.theme.defence",
    accent: "#9c5b3a",
    income: "growth",
    linkedCurrency: "UAH",
    projectedYieldPct: 25,
    projectedYieldMaxPct: 29,
  },
];

const BY_ID = new Map(INZHUR_FUNDS.map((f) => [f.id, f]));

export function inzhurFund(id: string | undefined): InzhurFund | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export interface InzhurQuote {
  id: string;
  name: string;
  navPerCertificate: number;
  projectedYieldPct: number;
  projectedYieldMaxPct?: number;
  projectedCurrency?: "USD" | "UAH";
  actualYieldPct?: number;
  actualYieldCurrency?: "USD" | "UAH";
  income: InzhurIncome;
}

export interface InzhurQuotesResponse {
  quotes: InzhurQuote[];
  fetchedAt: string;
  partial: boolean;
}

export async function fetchInzhurQuotes(ids?: string[]): Promise<InzhurQuotesResponse> {
  const query = ids?.length ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
  const res = await fetch(`/api/inzhur${query}`, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Inzhur responded with ${res.status}`);
  }
  return (await res.json()) as InzhurQuotesResponse;
}

