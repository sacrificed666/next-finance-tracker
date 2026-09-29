import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const cache = new Map<string, number>();

export async function GET(request: Request) {
  if (!(await auth())?.user?.id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(request.url);
  const currency = url.searchParams.get("currency") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!/^(USD|EUR)$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pass currency=USD|EUR and date=YYYY-MM-DD." }, { status: 400 });
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
