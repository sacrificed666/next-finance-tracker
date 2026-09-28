import { addDays, pad } from "@/lib/date";
import { convert } from "@/lib/finance/money";
import { ESV_MIN_UAH, taxRegime } from "@/lib/finance/tax";
import type { AppState, TaxRegimeId, Transaction } from "@/lib/types";

/**
 * What a sole proprietor (ФОП) has to file and pay, and when, derived from the
 * regime in the tax profile and the income recorded:
 *
 * - groups 3 and 3 + VAT: a quarterly declaration within 40 days of the
 *   quarter's end; single tax and military levy within the 10 days after
 *   that (50 days); ЄСВ by the 20th of the month after the quarter; VAT
 *   monthly — declaration by the 20th, payment within 10 days after;
 * - groups 1 and 2: single tax and military levy as monthly advances by the
 *   20th, ЄСВ quarterly, and a yearly declaration within 60 days of the year's
 *   end.
 *
 * A deadline that falls on a weekend moves to the next Monday. The figures are
 * a guide, not tax advice: the tax office's own cabinet has the final word.
 */

export type ObligationKind = "declaration" | "single" | "levy" | "esv" | "vatDeclaration" | "vat";

export interface TaxObligation {
  /** Stable across renders: "<period>:<kind>", the key `settings.taxPaid` uses. */
  id: string;
  kind: ObligationKind;
  /** "2026-Q3", "2026-09" or "2026". */
  period: string;
  due: string;
  /** In hryvnias; absent for filings. */
  amount?: number;
  /** The income a percentage applies to, in hryvnias. */
  base?: number;
}

const CALENDAR_REGIMES = new Set<TaxRegimeId>(["fop1", "fop2", "fop3", "fop3vat"]);

export function hasTaxCalendar(regime: TaxRegimeId): boolean {
  return CALENDAR_REGIMES.has(regime);
}

/** Saturday and Sunday deadlines move to Monday. */
function workday(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 6 ? addDays(date, 2) : day === 0 ? addDays(date, 1) : date;
}

const quarterEnd = (year: number, q: number) => {
  const month = q * 3;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(last)}`;
};

/** Income with tax recorded, in hryvnias, over a date range (inclusive). */
export function taxedIncome(state: AppState, from: string, to: string): { gross: number; vat: number; entries: Transaction[] } {
  const { settings } = state;
  let gross = 0;
  let vat = 0;
  const entries: Transaction[] = [];
  for (const tx of state.transactions) {
    if (tx.type !== "income" || !tx.tax || tx.date < from || tx.date > to) continue;
    const vatPct = tx.tax.vatPct ?? 0;
    const g = convert(tx.tax.gross, tx.currency, "UAH", settings.rates);
    gross += g;
    vat += vatPct > 0 ? g - g / (1 + vatPct / 100) : 0;
    entries.push(tx);
  }
  return { gross, vat, entries };
}

const ratePart = (regime: TaxRegimeId, id: string) => taxRegime(regime).components.find((c) => c.id === id);

/** Every obligation for the regime whose due date falls in the given year or the first months of the next. */
export function taxObligations(state: AppState, year: number): TaxObligation[] {
  const regime = state.settings.tax.regime;
  if (!hasTaxCalendar(regime)) return [];
  const out: TaxObligation[] = [];

  for (let q = 1; q <= 4; q++) {
    const period = `${year}-Q${q}`;
    const end = quarterEnd(year, q);
    const start = `${year}-${pad(q * 3 - 2)}-01`;
    const nextMonth = q === 4 ? `${year + 1}-01` : `${year}-${pad(q * 3 + 1)}`;
    out.push({ id: `${period}:esv`, kind: "esv", period, due: workday(`${nextMonth}-20`), amount: 3 * ESV_MIN_UAH });

    if (regime === "fop3" || regime === "fop3vat") {
      const income = taxedIncome(state, start, end);
      const base = income.gross - income.vat;
      const single = ratePart(regime, "single")?.ratePct ?? 0;
      const levy = ratePart(regime, "levy")?.ratePct ?? 0;
      out.push({ id: `${period}:declaration`, kind: "declaration", period, due: workday(addDays(end, 40)) });
      out.push({ id: `${period}:single`, kind: "single", period, due: workday(addDays(end, 50)), amount: (base * single) / 100, base });
      out.push({ id: `${period}:levy`, kind: "levy", period, due: workday(addDays(end, 50)), amount: (base * levy) / 100, base });
    }
  }

  for (let m = 1; m <= 12; m++) {
    const period = `${year}-${pad(m)}`;
    if (regime === "fop1" || regime === "fop2") {
      out.push({ id: `${period}:single`, kind: "single", period, due: workday(`${period}-20`), amount: ratePart(regime, "single")?.fixedUAH });
      out.push({ id: `${period}:levy`, kind: "levy", period, due: workday(`${period}-20`), amount: ratePart(regime, "levy")?.fixedUAH });
    }
    if (regime === "fop3vat") {
      const nextMonth = m === 12 ? `${year + 1}-01` : `${year}-${pad(m + 1)}`;
      const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
      const income = taxedIncome(state, `${period}-01`, `${period}-${pad(last)}`);
      const filing = workday(`${nextMonth}-20`);
      out.push({ id: `${period}:vatDeclaration`, kind: "vatDeclaration", period, due: filing });
      out.push({ id: `${period}:vat`, kind: "vat", period, due: workday(addDays(`${nextMonth}-20`, 10)), amount: income.vat, base: income.gross });
    }
  }

  if (regime === "fop1" || regime === "fop2") {
    out.push({ id: `${year}:declaration`, kind: "declaration", period: String(year), due: workday(addDays(`${year}-12-31`, 60)) });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.kind.localeCompare(b.kind));
}

/** Obligations still to settle around today: the overdue unpaid ones, then the next ones due. */
export function upcomingObligations(state: AppState, today: string, limit = 5): TaxObligation[] {
  const year = Number(today.slice(0, 4));
  const paid = state.settings.taxPaid ?? {};
  const all = [...taxObligations(state, year - 1), ...taxObligations(state, year)];
  return all
    .filter((o) => !paid[o.id] && (o.amount === undefined || o.amount > 0.5 || o.kind === "esv"))
    .filter((o) => o.due >= addDays(today, -45))
    .slice(0, limit);
}
