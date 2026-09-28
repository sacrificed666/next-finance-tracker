import { addMonths, dateInMonth, monthDiff, monthOf } from "@/lib/date";
import { investmentAt, projectedSnapshot } from "@/lib/finance/finmath";
import { convert, formatPercent } from "@/lib/finance/money";
import type { ReturnPolicy } from "@/lib/finance/returns";
import { valuationOf } from "@/lib/constants";
import type { useT } from "@/lib/i18n";
import type { CompoundingFreq, Investment, InvestmentKind, Settings } from "@/lib/types";

export type Translate = ReturnType<typeof useT>["t"];

/** The same calendar day one year from `today`. */
export function oneYearFrom(today: string): string {
  return dateInMonth(addMonths(monthOf(today), 12), Number(today.slice(8, 10)));
}

/** Month-end values over the last year (or since purchase), for an investment's sparkline. */
export function sparkValues(inv: Investment, today: string): number[] {
  const nowMonth = monthOf(today);
  const yearAgo = addMonths(nowMonth, -12);
  const startMonth = monthOf(inv.startDate);
  const from = monthDiff(yearAgo, startMonth) > 0 ? startMonth : yearAgo;
  const day = Number(today.slice(8, 10));
  const values: number[] = [];
  for (let m = from; monthDiff(m, nowMonth) >= 0; m = addMonths(m, 1)) {
    const at = m === nowMonth ? today : dateInMonth(m, day);
    values.push(investmentAt(inv, at).value);
  }
  return values;
}

/**
 * What one position has earned so far and is expected to earn over the next
 * year, in its own currency. Market-valued assets count projected growth; the
 * rest count interest, coupons and dividends.
 */
export function positionReturns(inv: Investment, today: string, yearOut: string) {
  const snap = investmentAt(inv, today);
  const ahead = investmentAt(inv, yearOut);
  const earned = snap.accrued + snap.paidOut;
  const proj = projectedSnapshot(inv, today, yearOut);
  const nextYear =
    valuationOf(inv.kind) === "market"
      ? proj.value - snap.value - (inv.monthlyContribution ?? 0) * 12 + proj.paidOut
      : ahead.accrued + ahead.paidOut - earned;
  // Top-ups arrive through the year, so on average half of them are at work.
  const averageCapital = snap.value + (inv.monthlyContribution ?? 0) * 6;
  return {
    snap,
    earned,
    nextYear,
    averageCapital,
    gainPct: snap.invested > 0 ? (earned / snap.invested) * 100 : 0,
    nextYearPct: averageCapital > 0 ? (nextYear / averageCapital) * 100 : 0,
  };
}

export function investmentsByKind(
  investments: Investment[],
  today: string,
  settings: Settings,
): Array<{ kind: InvestmentKind; invested: number; value: number; earned: number }> {
  const acc = new Map<InvestmentKind, { invested: number; value: number; earned: number }>();
  for (const inv of investments) {
    const snap = investmentAt(inv, today);
    const to = (n: number) => convert(n, inv.currency, settings.baseCurrency, settings.rates);
    const row = acc.get(inv.kind) ?? { invested: 0, value: 0, earned: 0 };
    row.invested += to(snap.invested);
    row.value += to(snap.value);
    row.earned += to(snap.accrued + snap.paidOut);
    acc.set(inv.kind, row);
  }
  return [...acc.entries()].map(([kind, row]) => ({ kind, ...row })).sort((x, y) => y.value - x.value);
}

export function returnLabel(policy: ReturnPolicy, kind: InvestmentKind, freq: CompoundingFreq, t: Translate): string {
  switch (policy.style) {
    case "interest":
      return policy.compounding === "reinvest"
        ? t("balance.inv.mode.compound", { freq: t(`freq.${freq}.adverb`) })
        : t("balance.inv.mode.simple");
    case "coupons":
      return t("balance.inv.mode.coupons");
    case "dividends":
      if (policy.compounding === "reinvest") return t("balance.inv.mode.dividendsReinvested");
      return kind === "inzhur" ? t("balance.inv.mode.monthlyDividends") : t("balance.inv.mode.dividends");
    default:
      return t("balance.inv.mode.growth");
  }
}

export function yieldRange(min: number, max: number | undefined, currency: string | undefined, t: Translate): string {
  const pct = max && max > min ? `${formatPercent(min)}–${formatPercent(max)}` : formatPercent(min);
  return t("balance.perYear", { pct }) + (currency ? ` · ${currency}` : "");
}
