import { formatMoney, parseAmount } from "@/lib/finance/money";
import { taxRegime } from "@/lib/finance/tax";
import type { Currency, IncomeBreakdown, IncomeTax, TaxRegimeId } from "@/lib/types";

/** Empty means zero; anything else must parse. */
export function parseOptional(input: string): number {
  if (input.trim() === "") return 0;
  return parseAmount(input);
}

export function breakdownSummary(b: IncomeBreakdown, currency: Currency, dayUnit: string): string {
  const parts = [`${b.days}${dayUnit} × ${formatMoney(b.dailyRate, currency, { exact: true })}`];
  if (b.premium) parts.push(`+${formatMoney(b.premium, currency)}`);
  if (b.compensations) parts.push(`+${formatMoney(b.compensations, currency)}`);
  if (b.cutoffs) parts.push(`−${formatMoney(b.cutoffs, currency)}`);
  return parts.join("  ");
}

/** A stored tax only counts as a named regime while its numbers still match that regime. */
export function regimeOfStoredTax(tax: IncomeTax): TaxRegimeId {
  if (tax.regime && tax.regime !== "custom") {
    const r = taxRegime(tax.regime);
    const same =
      Math.abs(r.ratePct - tax.ratePct) < 1e-9 &&
      Math.abs(r.fixedUAH - tax.fixedUAH) < 1e-6 &&
      Math.abs(r.vatPct - (tax.vatPct ?? 0)) < 1e-9;
    if (same) return tax.regime;
  }
  return "custom";
}
