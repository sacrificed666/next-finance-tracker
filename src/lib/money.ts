import { formatLocale } from "./i18n/format";
import type { Currency, Settings } from "./types";

export function rateToUAH(currency: Currency, rates: Settings["rates"]): number {
  if (currency === "UAH") return 1;
  return rates[currency];
}

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
  const locale = formatLocale();
  const key = `${locale}|${minFraction}-${maxFraction}`;
  let fmt = fmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      minimumFractionDigits: minFraction,
      maximumFractionDigits: maxFraction,
    });
    fmtCache.set(key, fmt);
  }
  return fmt;
}

const MINUS = "−";

export function formatNumber(value: number, maxFraction = 2): string {
  return numberFormat(0, maxFraction).format(value).replace(/^-/, MINUS);
}

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
  const m = body.match(/^([+−-]?)(.*)$/);
  return `${m?.[1] ?? ""}${symbol}${m?.[2] ?? body}`;
}

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : "";
  if (abs >= 1_000_000) return `${sign}${numberFormat(0, 1).format(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}${numberFormat(0, 1).format(abs / 1000)}K`;
  return `${sign}${numberFormat(0, 0).format(Math.round(abs))}`;
}

export function formatPercent(value: number, fraction = 1): string {
  return `${numberFormat(0, fraction).format(value).replace(/^-/, MINUS)}%`;
}


function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function parseAmount(input: string): number {
  let normalized = input.replace(/\s/g, "").replace(/−/g, "-");
  if (normalized.includes(",") && normalized.includes(".")) {
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
