import type { AppState, Currency } from "@/lib/types";
import { fingerprint, suggestCategory, type ImportCandidate } from "./import";

export interface CsvMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  mcc: number;
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.slice(0, clean.indexOf("\n") >= 0 ? clean.indexOf("\n") : clean.length);
  const delimiter = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const find = (header: string[], patterns: RegExp[]) => {
  for (const re of patterns) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

export function guessMapping(header: string[]): CsvMapping {
  const h = header.map((x) => x.toLocaleLowerCase());
  return {
    date: find(h, [/дата/, /date/, /дата і час/]),
    description: find(h, [/деталі/, /опис/, /призначення/, /description/, /details/, /назва/, /коментар/]),
    amount: find(h, [/сума в валюті картки/, /сума.*картк/, /^сума/, /amount/, /сума/, /sum/]),
    debit: find(h, [/^витрат/, /debit/, /списан/]),
    mcc: find(h, [/^mcc$/, /mcc/]),
  };
}

export function parseNumber(raw: string): number {
  let s = raw.replace(/[\s  ]/g, "").replace(/[−–]/g, "-").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return Number(s);
}

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function candidatesFromCsv(
  state: AppState,
  rows: string[][],
  mapping: CsvMapping,
  currency: Currency,
): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  for (const row of rows) {
    const date = parseDate(row[mapping.date] ?? "");
    if (!date) continue;
    let signed = parseNumber(row[mapping.amount] ?? "");
    if (mapping.debit >= 0) {
      const spent = parseNumber(row[mapping.debit] ?? "");
      if (Number.isFinite(spent) && spent !== 0) signed = -Math.abs(spent);
    }
    if (!Number.isFinite(signed) || signed === 0) continue;
    const description = (row[mapping.description] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const mccRaw = mapping.mcc >= 0 ? Number(row[mapping.mcc]) : NaN;
    const mcc = Number.isInteger(mccRaw) && mccRaw > 0 ? mccRaw : undefined;
    const type = signed < 0 ? "expense" : "income";
    out.push({
      externalId: `csv:${fingerprint(`${date}|${signed}|${description}`)}`,
      date,
      type,
      amount: Math.abs(signed),
      currency,
      description,
      mcc,
      categoryId: suggestCategory(state, description, type, mcc),
      duplicate: false,
    });
  }
  return out;
}
