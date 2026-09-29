import { NextResponse } from "next/server";
import { averageRate } from "@/lib/finance/month-rates";
import { auth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const cache = new Map<string, number>();
const months = new Map<string, { USD: number; EUR: number }>();

function kyivMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

async function monthAverage(currency: "USD" | "EUR", month: string): Promise<number | null> {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month.replace("-", "")}01`;
  const to = `${month.replace("-", "")}${String(last).padStart(2, "0")}`;
  const res = await fetch(
    `https://bank.gov.ua/NBU_Exchange/exchange_site?start=${from}&end=${to}&valcode=${currency.toLowerCase()}&sort=exchangedate&order=asc&json`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) return null;
  return averageRate((await res.json()) as Array<{ rate_per_unit?: number; rate?: number }>);
}

async function forMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= kyivMonth()) {
    return NextResponse.json({ error: "Pass a month that has ended, as YYYY-MM." }, { status: 400 });
  }
  const known = months.get(month);
  if (known) return NextResponse.json(known);
  try {
    const [usd, eur] = await Promise.all([monthAverage("USD", month), monthAverage("EUR", month)]);
    if (!usd || !eur) throw new Error("no rate");
    const rates = { USD: usd, EUR: eur };
    months.set(month, rates);
    return NextResponse.json(rates);
  } catch {
    return NextResponse.json({ error: "NBU did not answer." }, { status: 502 });
  }
}

export async function GET(request: Request) {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (month !== null) return forMonth(month);
  const currency = url.searchParams.get("currency") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!/^(USD|EUR)$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pass currency=USD|EUR and date=YYYY-MM-DD, or month=YYYY-MM." }, { status: 400 });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "The NBU sets a rate only for days that have come." }, { status: 404 });
  }
  const key = `${currency}:${date}`;
  const known = cache.get(key);
  if (known) return NextResponse.json({ rate: known });

  try {
    const res = await fetch(
      `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${currency}&date=${date.replaceAll("-", "")}&json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const rows = (await res.json()) as Array<{ rate?: number }>;
    const rate = rows[0]?.rate;
    if (!res.ok || typeof rate !== "number" || rate <= 0) throw new Error("no rate");
    cache.set(key, rate);
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "NBU did not answer." }, { status: 502 });
  }
}
