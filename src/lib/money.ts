import type { Currency, Settings } from "./types";

/** UAH per 1 unit of the given currency */
export function rateToUAH(currency: Currency, rates: Settings["rates"]): number {
  if (currency === "UAH") return 1;
  return rates[currency];
}

/** convert an amount between currencies via UAH pivot */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Settings["rates"],
): number {
  if (from === to) return amount;
  return (amount * rateToUAH(from, rates)) / rateToUAH(to, rates);
}

const fmtCache = new Map<string, Intl.NumberFormat>();

function numberFormat(minFraction: number, maxFraction: number): Intl.NumberFormat {
  const key = `${minFraction}-${maxFraction}`;
  let fmt = fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minFraction,
      maximumFractionDigits: maxFraction,
    });
    fmtCache.set(key, fmt);
  }
  return fmt;
}

/**
 * U+2212, the typographic minus, not the hyphen `Intl` reaches for. It matches
 * the width of the digits beside it, which is the whole point of setting these
 * columns in tabular figures. The app was already writing this character by
 * hand wherever it negated a value in JSX (`−{formatMoney(debt)}`), so a table
 * could show both glyphs in the same column of amounts.
 */
const MINUS = "−";

/**
 * "$1,239.57" / "€1,067.05" / "54,206.26 ₴" — dollar and euro symbols lead,
 * hryvnia trails (matching common Ukrainian finance-sheet style).
 */
export function formatMoney(
  amount: number,
  currency: Currency,
  opts: { compact?: boolean; sign?: boolean; exact?: boolean } = {},
): string {
  const sign = opts.sign && amount > 0 ? "+" : "";
  const body = opts.compact
    ? formatCompact(amount)
    : opts.exact
      ? numberFormat(2, 2).format(roundTo(amount, 2))
      : Math.abs(amount) >= 1000
        ? numberFormat(0, 0).format(Math.round(amount))
        : numberFormat(0, 2).format(roundTo(amount, 2));
  return withSymbol(`${sign}${body.replace(/^-/, MINUS)}`, currency);
}

function withSymbol(body: string, currency: Currency): string {
  if (currency === "UAH") return `${body} ₴`;
  const symbol = currency === "USD" ? "$" : "€";
  // keep the sign in front of the symbol: +$1,200 / −$1,200
  const m = body.match(/^([+−-]?)(.*)$/);
  return `${m?.[1] ?? ""}${symbol}${m?.[2] ?? body}`;
}

/** 51.1K / 1.2M — for axis ticks and tight tiles */
export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : "";
  if (abs >= 1_000_000) return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${sign}${trimZero((abs / 1000).toFixed(1))}K`;
  return `${sign}${numberFormat(0, 0).format(Math.round(abs))}`;
}

export function formatPercent(value: number, fraction = 1): string {
  return `${trimZero(value.toFixed(fraction)).replace(/^-/, MINUS)}%`;
}

function trimZero(s: string): string {
  return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** parse a user-typed amount: accepts "1 234,56" and "1,234.56" */
export function parseAmount(input: string): number {
  // a value pasted back out of the app carries the typographic minus above,
  // which `Number` does not recognise
  let normalized = input.replace(/\s/g, "").replace(/−/g, "-");
  if (normalized.includes(",") && normalized.includes(".")) {
    // both present: the last one is the decimal separator
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else {
    normalized = normalized.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}
