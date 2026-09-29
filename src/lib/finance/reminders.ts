import { addDays, formatMonth } from "@/lib/date";
import type { I18n } from "@/lib/i18n/core";
import { setFormatLocale } from "@/lib/i18n/format";
import type { AppState, Currency, Transaction } from "@/lib/types";
import { isPlaceholder } from "./import";
import { formatMoney } from "./money";
import { hasTaxCalendar, upcomingObligations, type TaxObligation } from "./tax-calendar";

export type ReminderKind = "payment" | "income" | "tax" | "receivable";

export interface Reminder {
  kind: ReminderKind;
  date: string;
  subject: string;
  amount?: number;
  currency: Currency;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

const SHOWN = 5;
const TAX_NOTICE_DAYS = 3;

function subjectOf(state: AppState, tx: Transaction, i18n: I18n): string {
  const sub = tx.subscriptionId ? state.subscriptions.find((s) => s.id === tx.subscriptionId) : undefined;
  if (sub) return sub.name;
  if (tx.note) return tx.note;
  return i18n.category(state.categories.find((c) => c.id === tx.categoryId));
}

function taxSubject(o: TaxObligation, i18n: I18n): string {
  const quarter = /^(\d{4})-Q(\d)$/.exec(o.period);
  const period = quarter
    ? i18n.t("taxcal.quarter", { q: quarter[2], year: quarter[1] })
    : /^\d{4}-\d{2}$/.test(o.period)
      ? formatMonth(o.period)
      : o.period;
  return i18n.tk(`taxcal.${o.kind}`, o.kind, { period });
}

export function dueReminders(state: AppState, today: string, i18n: I18n): Reminder[] {
  setFormatLocale(i18n.intl);
  const tomorrow = addDays(today, 1);
  const out: Reminder[] = [];

  for (const tx of state.transactions) {
    if (tx.type === "transfer" || tx.externalId || !isPlaceholder(tx) || tx.id.startsWith("tax:")) continue;
    if (tx.date !== today && tx.date !== tomorrow) continue;
    out.push({
      kind: tx.type === "income" ? "income" : "payment",
      date: tx.date,
      subject: subjectOf(state, tx, i18n),
      amount: tx.amount,
      currency: tx.currency,
    });
  }

  if (hasTaxCalendar(state.settings.tax.regime)) {
    for (const o of upcomingObligations(state, today, 20)) {
      if (o.due !== today && o.due !== addDays(today, TAX_NOTICE_DAYS)) continue;
      out.push({ kind: "tax", date: o.due, subject: taxSubject(o, i18n), amount: o.amount || undefined, currency: "UAH" });
    }
  }

  for (const r of state.receivables) {
    if (r.dueDate !== today || r.repaid >= r.amount) continue;
    out.push({
      kind: "receivable",
      date: today,
      subject: i18n.t("push.receivable", { name: r.name }),
      amount: r.amount - r.repaid,
      currency: r.currency,
    });
  }

  const order: Record<ReminderKind, number> = { tax: 0, payment: 1, receivable: 2, income: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (b.amount ?? 0) - (a.amount ?? 0));
}

export function reminderMessage(reminders: Reminder[], today: string, i18n: I18n): PushMessage | null {
  if (reminders.length === 0) return null;
  setFormatLocale(i18n.intl);
  const tomorrow = addDays(today, 1);
  const when = (date: string) => {
    if (date === today) return i18n.t("push.today");
    if (date === tomorrow) return i18n.t("push.tomorrow");
    return i18n.tp("push.inDays", Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000));
  };
  const line = (r: Reminder) => {
    const amount = r.amount ? formatMoney(r.amount, r.currency, { sign: r.kind === "income" || r.kind === "receivable" }) : "";
    return [when(r.date), r.subject, amount].filter(Boolean).join(" · ");
  };
  const lines = reminders.slice(0, SHOWN).map(line);
  if (reminders.length > SHOWN) lines.push(i18n.tp("push.more", reminders.length - SHOWN));
  return {
    title: i18n.t("push.title"),
    body: lines.join("\n"),
    url: reminders.some((r) => r.kind === "tax") ? "/income" : "/calendar",
    tag: `digest-${today}`,
  };
}
