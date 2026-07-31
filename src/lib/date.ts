/** month key helpers — months are "yyyy-mm" strings, dates are "yyyy-mm-dd" */

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

/** shift a yyyy-mm key by n months (n may be negative) */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}`;
}

/** whole months from `a` to `b` (b - a), both yyyy-mm */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** clamp a day-of-month into the given month, returns yyyy-mm-dd */
export function dateInMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(day, daysInMonth(month)))}`;
}

/** fractional years between two ISO dates (365.25-day years) */
export function yearsBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.max(0, (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000));
}

/**
 * Whole calendar months elapsed from `fromISO` to `toISO` — a month counts
 * only once the day-of-month has been reached or passed (a "monthiversary"
 * count), unlike a fixed 365.25/12-day average which mis-counts around
 * shorter months such as February.
 */
export function wholeMonthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "July 2026" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "Jul" */
export function formatMonthShort(month: string): string {
  const [, m] = month.split("-").map(Number);
  return MONTHS_SHORT[m - 1];
}

/** "Jul 2026" */
export function formatMonthCompact(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "21 Jul 2026" */
export function formatDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "21 Jul" */
export function formatDateShort(dateISO: string): string {
  const [, m, d] = dateISO.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/**
 * "21 Jul 2026, 14:05" from an ISO datetime. Exchange rates move during the
 * day, so a date alone cannot answer "is this still fresh?" — unlike the
 * yyyy-mm-dd helpers above, this one is local-time and takes a full timestamp.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso.slice(0, 10));
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
