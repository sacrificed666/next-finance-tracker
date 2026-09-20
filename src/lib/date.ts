import { formatLocale } from "./i18n/format";

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}`;
}

export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function dateInMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

export function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


export function yearsBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.max(0, (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000));
}

export function wholeMonthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = formatLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let fmt = dtfCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options });
    dtfCache.set(key, fmt);
  }
  return fmt;
}

function utc(y: number, m: number, d = 1): Date {
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase(formatLocale()) + s.slice(1);
}

function stripDot(s: string): string {
  return s.replace(/\.$/, "");
}

const namesCache = new Map<string, string[]>();

function names(style: "long" | "short"): string[] {
  const key = `${formatLocale()}|${style}`;
  let list = namesCache.get(key);
  if (!list) {
    const fmt = dtf({ month: style });
    list = Array.from({ length: 12 }, (_, i) => {
      const raw = fmt.format(utc(2024, i + 1));
      return capitalize(style === "short" ? stripDot(raw) : raw);
    });
    namesCache.set(key, list);
  }
  return list;
}

export function monthNames(): string[] {
  return names("long");
}

export function monthNamesShort(): string[] {
  return names("short");
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${monthNames()[m - 1]} ${y}`;
}

export function formatMonthShort(month: string): string {
  const [, m] = month.split("-").map(Number);
  return monthNamesShort()[m - 1];
}

export function formatMonthCompact(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${monthNamesShort()[m - 1]} ${y}`;
}

export function formatDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return dtf({ day: "numeric", month: "short", year: "numeric" }).format(utc(y, m, d));
}

export function formatDateShort(dateISO: string): string {
  const [, m, d] = dateISO.split("-").map(Number);
  return dtf({ day: "numeric", month: "short" }).format(utc(2024, m, d));
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso.slice(0, 10));
  return new Intl.DateTimeFormat(formatLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(formatLocale(), { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function formatWeekday(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return capitalize(dtf({ weekday: "short" }).format(utc(y, m, d)));
}
