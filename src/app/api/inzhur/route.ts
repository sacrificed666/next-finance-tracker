import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { INZHUR_FUNDS, type InzhurQuote } from "@/lib/market/inzhur";

export const dynamic = "force-dynamic";

const ORIGIN = "https://www.inzhur.reit";
const USER_AGENT =
  "Mozilla/5.0 (compatible; next-finance-tracker/1.0; +https://github.com/)";
const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

const NAV_LABEL = "ВЧА\\s+на\\s+(?:1\\s+)?сертифікат";
const NAV_KEY = "certificateNetAssetPrice";
const NAV_WINDOW = 240;

interface CacheEntry {
  quotes: Map<string, InzhurQuote>;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

function parseUaNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/ | |\s/g, "")
    .replace(/₴/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function extractNav(html: string): number | null {
  const text = html.replace(/&quot;|&#34;|&#x22;/giu, '"');

  const rendered = new RegExp(
    `<dd[^>]*>([^<]*)</dd>\\s*<dt[^>]*>\\s*${NAV_LABEL}\\s*</dt>`,
    "u",
  ).exec(text);
  if (rendered) {
    const value = parseUaNumber(rendered[1]);
    if (value) return value;
  }

  const key = text.indexOf(`"${NAV_KEY}"`);
  if (key > 0) {
    const before = text.slice(Math.max(0, key - NAV_WINDOW), key);
    const quoted = [...before.matchAll(/"([0-9][0-9\s ]*(?:[.,][0-9]+)?)"/gu)];
    for (let i = quoted.length - 1; i >= 0; i--) {
      const value = parseUaNumber(quoted[i][1]);
      if (value) return value;
    }
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
const ACTUAL_RE = /фактичн[а-яіїєґ']*\s+дохідн[а-яіїєґ']*\s+фонду/giu;
const PCT_RE =
  /(\d{1,3}(?:[.,]\d{1,2})?)(?:\s*[-–—]\s*(\d{1,3}(?:[.,]\d{1,2})?))?\s*%([^%]{0,40})/giu;
const LABEL_LEAD = 90;
const LABEL_TAIL = 220;

interface Yield {
  min: number;
  max?: number;
  currency?: "USD" | "UAH";
}

function readPct(fragment: string, pick: "first" | "last"): Yield | null {
  let found: Yield | null = null;
  for (const match of fragment.matchAll(PCT_RE)) {
    const min = parsePct(match[1]);
    if (!min) continue;
    found = { min, max: parsePct(match[2]), currency: currencyOf(match[3]) };
    if (pick === "first") break;
  }
  return found;
}

function yieldNear(text: string, label: RegExp): Yield | null {
  for (const match of text.matchAll(label)) {
    const start = match.index ?? 0;
    const before = readPct(text.slice(Math.max(0, start - LABEL_LEAD), start), "last");
    if (before) return before;
    const tail = start + match[0].length;
    const after = readPct(text.slice(tail, tail + LABEL_TAIL), "first");
    if (after) return after;
  }
  return null;
}

function extractProjected(text: string): Yield | null {
  return yieldNear(text, PROJECTED_RE);
}

function extractActual(text: string): { pct: number; currency?: "USD" | "UAH" } | null {
  const found = yieldNear(text, ACTUAL_RE);
  return found ? { pct: found.min, currency: found.currency } : null;
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

async function loadQuotes(): Promise<Array<InzhurQuote | null>> {
  return Promise.all(
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
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    try {
      const loaded = await loadQuotes();
      const quotes = new Map(cache?.quotes ?? []);
      for (const quote of loaded) {
        if (quote) quotes.set(quote.id, quote);
      }
      if (quotes.size > 0) cache = { quotes, fetchedAt: now };
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
  const all = [...cache.quotes.values()];
  const quotes = filter ? all.filter((q) => filter.has(q.id)) : all;

  return NextResponse.json({
    quotes,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
    partial: all.length < INZHUR_FUNDS.length,
  });
}
