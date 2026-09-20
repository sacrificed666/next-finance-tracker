import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { INZHUR_FUNDS, type InzhurQuote } from "@/lib/inzhur";

export const dynamic = "force-dynamic";

const ORIGIN = "https://www.inzhur.reit";
const USER_AGENT =
  "Mozilla/5.0 (compatible; next-finance-tracker/1.0; +https://github.com/)";
const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const NAV_LABEL = "ВЧА на сертифікат";

interface CacheEntry {
  quotes: InzhurQuote[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

function parseUaNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/ | |\s/g, "")
    .replace(/₴/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractNav(html: string): number | null {
  const rendered = new RegExp(
    `<dd[^>]*>([^<]*)</dd>\\s*<dt[^>]*>\\s*${NAV_LABEL}\\s*</dt>`,
    "u",
  ).exec(html);
  if (rendered) {
    const value = parseUaNumber(rendered[1]);
    if (value) return value;
  }
  const payload = /"([0-9]+[.,][0-9]+)"\s*,\s*"certificateNetAssetPrice"/u.exec(html);
  if (payload) {
    const value = parseUaNumber(payload[1]);
    if (value) return value;
  }
  return null;
}

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
}

function parsePct(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 && value < 200 ? value : undefined;
}

function currencyOf(raw: string | undefined): "USD" | "UAH" | undefined {
  if (!raw) return undefined;
  return /USD|долар/u.test(raw) ? "USD" : /UAH|гривн/u.test(raw) ? "UAH" : undefined;
}

const PROJECTED_RE =
  /прогнозован[а-яіїєґ']*\s+(?:середньорічн[а-яіїєґ']*\s+)?(?:прост[а-яіїєґ']*\s+)?дохідн[а-яіїєґ']*\s+фонду/giu;
const PCT_RE = /(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*[-–—]\s*(\d{1,3}(?:[.,]\d{1,2})?))?\s*%/u;

function extractProjected(
  text: string,
): { min: number; max?: number; currency?: "USD" | "UAH" } | null {
  for (const match of text.matchAll(PROJECTED_RE)) {
    const start = (match.index ?? 0) + match[0].length;
    const tail = text.slice(start, start + 220);
    const pct = PCT_RE.exec(tail);
    const min = parsePct(pct?.[1]);
    if (!pct || !min) continue;
    const after = tail.slice(pct.index, pct.index + 60);
    return {
      min,
      max: parsePct(pct[2]),
      currency: currencyOf(/\b(USD|UAH)\b|доларах|гривн/u.exec(after)?.[0]),
    };
  }
  return null;
}

function extractActual(text: string): { pct: number; currency?: "USD" | "UAH" } | null {
  const match =
    /(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*у\s*(USD|UAH)\s*Фактична дохідність фонду за останні 12/u.exec(text) ??
    /Фактична дохідність фонду\s*за останні 12 міс\s*[-–—:]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%\s*у\s*(USD|UAH)/u.exec(text);
  const pct = parsePct(match?.[1]);
  return match && pct ? { pct, currency: currencyOf(match[2]) } : null;
}

async function fetchFundPage(slug: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORIGIN}/offer/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadQuotes(): Promise<InzhurQuote[]> {
  const results = await Promise.all(
    INZHUR_FUNDS.map(async (fund): Promise<InzhurQuote | null> => {
      const html = await fetchFundPage(fund.slug);
      if (!html) return null;
      const nav = extractNav(html);
      if (nav === null) return null;
      const text = pageText(html);
      const projected = extractProjected(text);
      const actual = extractActual(text);
      return {
        id: fund.id,
        name: fund.name,
        navPerCertificate: nav,
        projectedYieldPct: projected?.min ?? fund.projectedYieldPct,
        projectedYieldMaxPct: projected ? projected.max : fund.projectedYieldMaxPct,
        projectedCurrency: projected?.currency ?? fund.linkedCurrency,
        actualYieldPct: actual?.pct,
        actualYieldCurrency: actual?.currency,
        income: fund.income,
      };
    }),
  );
  return results.filter((q): q is InzhurQuote => q !== null);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    try {
      const quotes = await loadQuotes();
      if (quotes.length > 0) cache = { quotes, fetchedAt: now };
    } catch (err) {
      console.error("[api/inzhur]", err);
    }
  }

  if (!cache) {
    return NextResponse.json(
      { error: "Could not reach Inzhur — try again in a minute." },
      { status: 503 },
    );
  }

  const wanted = new URL(request.url).searchParams.get("ids");
  const filter = wanted
    ? new Set(wanted.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const quotes = filter
    ? cache.quotes.filter((q) => filter.has(q.id))
    : cache.quotes;

  return NextResponse.json({
    quotes,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    partial: quotes.length < INZHUR_FUNDS.length,
  });
}
