import type { I18n } from "@/lib/i18n/core";
import type { AppState, Currency, Transaction } from "@/lib/types";
import { convert, ratesAt } from "./money";

export interface CsvStyle {
  separator: string;
  decimal: string;
}

export interface ReportCsvRow {
  label: string;
  current: number;
  previous: number;
}

export function csvStyle(intl: string): CsvStyle {
  const decimal = new Intl.NumberFormat(intl).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  return decimal === "," ? { separator: ";", decimal: "," } : { separator: ",", decimal: "." };
}

function writer(style: CsvStyle) {
  const cell = (v: string) => (v.includes(style.separator) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", style.decimal);
  const line = (cells: string[]) => cells.join(style.separator);
  const file = (lines: string[][]) => "\uFEFF" + lines.map(line).join("\r\n") + "\r\n";
  return { cell, num, file };
}

export function journalCsv(state: AppState, transactions: Transaction[], i18n: I18n, today: string): string {
  const { t } = i18n;
  const { cell, num, file } = writer(csvStyle(i18n.intl));
  const base = state.settings.baseCurrency;
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const accounts = new Map(state.savings.map((a) => [a.id, a.name]));
  const categoryPath = (id: string) => {
    const cat = cats.get(id);
    const parent = cat?.parentId ? cats.get(cat.parentId) : undefined;
    return parent ? `${i18n.category(parent)} › ${i18n.category(cat)}` : i18n.category(cat);
  };
  const sign = (tx: Transaction) => (tx.type === "expense" ? -1 : 1);
  const head = [
    t("common.date"),
    t("export.col.type"),
    t("common.amount"),
    t("common.currency"),
    t("export.col.inBase", { currency: base }),
    t("common.category"),
    t("common.account"),
    t("export.col.toAccount"),
    t("common.note"),
    t("export.col.tags"),
    t("export.col.planned"),
  ];
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((tx) => [
      tx.date,
      t(`tx.type.${tx.type}`),
      num(sign(tx) * tx.amount),
      tx.currency,
      num(sign(tx) * convert(tx.amount, tx.currency, base, ratesAt(state.settings, tx.date))),
      cell(tx.type === "transfer" ? "" : categoryPath(tx.categoryId)),
      cell(tx.accountId ? (accounts.get(tx.accountId) ?? "") : ""),
      cell(tx.toAccountId ? (accounts.get(tx.toAccountId) ?? "") : ""),
      cell(tx.note ?? ""),
      cell((tx.tags ?? []).join(", ")),
      tx.date > today ? t("export.yes") : "",
    ]);
  return file([head.map(cell), ...rows]);
}

export function reportCsv(
  rows: ReportCsvRow[],
  totals: { income: ReportCsvRow; expense: ReportCsvRow; net: ReportCsvRow },
  periods: { current: string; previous: string },
  currency: Currency,
  i18n: I18n,
): string {
  const { t } = i18n;
  const { cell, num, file } = writer(csvStyle(i18n.intl));
  const line = (r: ReportCsvRow) => [cell(r.label), num(r.current), num(r.previous), num(r.current - r.previous)];
  return file([
    [t("common.category"), `${periods.current}, ${currency}`, `${periods.previous}, ${currency}`, t("export.col.change")].map(cell),
    ...rows.map(line),
    [],
    line(totals.income),
    line(totals.expense),
    line(totals.net),
  ]);
}
