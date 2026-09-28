import { addDays, pad } from "@/lib/date";
import { convert } from "@/lib/finance/money";
import { esvMinimum, taxRegime } from "@/lib/finance/tax";
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

const ratePart = (regime: TaxRegimeId, id: string, year: number) =>
  taxRegime(regime, year).components.find((c) => c.id === id);

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
    out.push({ id: `${period}:esv`, kind: "esv", period, due: workday(`${nextMonth}-20`), amount: 3 * esvMinimum(year) });

    if (regime === "fop3" || regime === "fop3vat") {
      const income = taxedIncome(state, start, end);
      const base = income.gross - income.vat;
      const single = ratePart(regime, "single", year)?.ratePct ?? 0;
      const levy = ratePart(regime, "levy", year)?.ratePct ?? 0;
      out.push({ id: `${period}:declaration`, kind: "declaration", period, due: workday(addDays(end, 40)) });
      out.push({ id: `${period}:single`, kind: "single", period, due: workday(addDays(end, 50)), amount: (base * single) / 100, base });
      out.push({ id: `${period}:levy`, kind: "levy", period, due: workday(addDays(end, 50)), amount: (base * levy) / 100, base });
    }
  }

  for (let m = 1; m <= 12; m++) {
    const period = `${year}-${pad(m)}`;
    if (regime === "fop1" || regime === "fop2") {
      out.push({ id: `${period}:single`, kind: "single", period, due: workday(`${period}-20`), amount: ratePart(regime, "single", year)?.fixedUAH });
      out.push({ id: `${period}:levy`, kind: "levy", period, due: workday(`${period}-20`), amount: ratePart(regime, "levy", year)?.fixedUAH });
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

/** The id of the expense that records an obligation as paid. */
export const taxPaymentId = (obligationId: string) => `tax:${obligationId}`;

/** The category tax payments are booked to: the default "Taxes & Fees", else one named like it, else "Other". */
export function taxCategoryId(state: AppState): string {
  const byId = state.categories.find((c) => c.id === "cat-taxes");
  if (byId) return byId.id;
  const byName = state.categories.find((c) => c.kind === "expense" && /tax|податк/i.test(c.name));
  return byName?.id ?? state.categories.find((c) => c.id === "cat-other-exp")?.id ?? "";
}

/**
 * Marks obligations paid, or not: `settings.taxPaid` remembers the day, and each
 * payment with an amount becomes an expense in the taxes category (id `tax:<id>`),
 * so it shows in spending and balances. Unmarking removes that expense again.
 * A bank import of the real payment later takes the expense's place.
 */
export function recordTaxPayments(
  state: AppState,
  obligations: TaxObligation[],
  paid: boolean,
  today: string,
  labelOf: (o: TaxObligation) => string,
): AppState {
  const taxPaid = { ...(state.settings.taxPaid ?? {}) };
  const ids = new Set(obligations.map((o) => taxPaymentId(o.id)));
  let transactions = state.transactions.filter((tx) => !ids.has(tx.id) || tx.externalId);
  for (const o of obligations) {
    if (paid) taxPaid[o.id] = today;
    else delete taxPaid[o.id];
  }
  if (paid) {
    const categoryId = taxCategoryId(state);
    const booked = new Set(transactions.map((tx) => tx.id));
    const added: Transaction[] = obligations
      .filter((o) => o.amount !== undefined && o.amount > 0.5 && !booked.has(taxPaymentId(o.id)))
      .map((o) => ({
        id: taxPaymentId(o.id),
        type: "expense",
        amount: Math.round(o.amount! * 100) / 100,
        currency: "UAH",
        categoryId,
        date: today,
        note: labelOf(o),
      }));
    transactions = [...transactions, ...added];
  }
  return { ...state, transactions, settings: { ...state.settings, taxPaid } };
}

/** How many hryvnias one unit was worth on a day: the NBU rate when known, else today's. */
export type RateOf = (currency: Transaction["currency"], date: string) => number;

export interface IncomeBookRow {
  date: string;
  description: string;
  /** In the currency it arrived in, before tax (and without VAT for a VAT payer). */
  amount: number;
  currency: Transaction["currency"];
  rate: number;
  uah: number;
}

/**
 * The year's taxed income as the книга обліку доходів lists it: one row per receipt,
 * in hryvnias at the rate of the day it arrived, VAT left out for a VAT payer.
 */
export function incomeBook(state: AppState, year: number, rateOf: RateOf): IncomeBookRow[] {
  return state.transactions
    .filter((tx) => tx.type === "income" && tx.tax && tx.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((tx) => {
      const vatPct = tx.tax!.vatPct ?? 0;
      const amount = vatPct > 0 ? tx.tax!.gross / (1 + vatPct / 100) : tx.tax!.gross;
      const rate = tx.currency === "UAH" ? 1 : rateOf(tx.currency, tx.date);
      return { date: tx.date, description: tx.note ?? "", amount, currency: tx.currency, rate, uah: amount * rate };
    });
}

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvNumber = (n: number, digits = 2) => n.toFixed(digits).replace(".", ",");

/**
 * The income book as a CSV for a spreadsheet: `;`-separated with decimal commas, as
 * Ukrainian Excel expects, and a byte-order mark so Cyrillic opens correctly. The
 * column names are Ukrainian — it is a Ukrainian tax record, whatever the app's language.
 */
export function incomeBookCsv(rows: IncomeBookRow[]): string {
  const head = ["Дата", "Сума доходу, грн", "Опис", "Сума у валюті", "Валюта", "Курс НБУ"];
  const lines = rows.map((r) =>
    [
      `${r.date.slice(8)}.${r.date.slice(5, 7)}.${r.date.slice(0, 4)}`,
      csvNumber(r.uah),
      csvCell(r.description),
      csvNumber(r.amount),
      r.currency,
      csvNumber(r.rate, 4),
    ].join(";"),
  );
  const total = rows.reduce((sum, r) => sum + r.uah, 0);
  return "﻿" + [head.join(";"), ...lines, ["Разом", csvNumber(total), "", "", "", ""].join(";")].join("\r\n") + "\r\n";
}

export interface DeclarationFigures {
  quarter: number;
  /** Income since 1 January up to the quarter's end, in hryvnias — declarations count cumulatively. */
  incomeToDate: number;
  singleToDate: number;
  levyToDate: number;
  /** What this quarter adds to the tax, after what earlier quarters already declared. */
  singleThisQuarter: number;
  levyThisQuarter: number;
}

/** A group 3 declaration's figures for one quarter: running totals from 1 January, and this quarter's share. */
export function declarationFigures(state: AppState, year: number, quarter: number, rateOf: RateOf): DeclarationFigures | null {
  const regime = state.settings.tax.regime;
  if (regime !== "fop3" && regime !== "fop3vat") return null;
  const single = ratePart(regime, "single", year)?.ratePct ?? 0;
  const levy = ratePart(regime, "levy", year)?.ratePct ?? 0;
  const book = incomeBook(state, year, rateOf);
  const upTo = (q: number) => book.filter((r) => Number(r.date.slice(5, 7)) <= q * 3).reduce((sum, r) => sum + r.uah, 0);
  const income = upTo(quarter);
  const before = quarter > 1 ? upTo(quarter - 1) : 0;
  return {
    quarter,
    incomeToDate: income,
    singleToDate: (income * single) / 100,
    levyToDate: (income * levy) / 100,
    singleThisQuarter: ((income - before) * single) / 100,
    levyThisQuarter: ((income - before) * levy) / 100,
  };
}
