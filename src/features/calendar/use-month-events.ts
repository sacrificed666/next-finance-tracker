"use client";

import { dateInMonth, daysInMonth, formatMonth, monthOf } from "@/lib/date";
import { convert } from "@/lib/finance/money";
import { taxObligations, type TaxObligation } from "@/lib/finance/tax-calendar";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Currency, Transaction } from "@/lib/types";

export type EventKind = "expense" | "income" | "transfer" | "tax" | "maturity" | "receivable" | "wish";

export interface DayEvent {
  id: string;
  date: string;
  kind: EventKind;
  title: string;
  subtitle?: string;
  icon: string;
  amount?: number;
  currency?: Currency;
  /** Set for entries, so a tap opens them. */
  tx?: Transaction;
}

export interface DaySummary {
  date: string;
  events: DayEvent[];
  /** What the day's entries add or take away, in the base currency. */
  net: number;
  spent: number;
}

/** A dot's colour for each kind of event, shared by the grid and the lists. */
export const KIND_COLOR: Record<EventKind, string> = {
  expense: "var(--expense)",
  income: "var(--income)",
  transfer: "var(--ink-3)",
  tax: "var(--warning)",
  maturity: "var(--series-6)",
  receivable: "var(--series-4)",
  wish: "var(--series-9)",
};

/**
 * Everything that happens in a month, day by day: entries (posted and planned),
 * tax deadlines, investments maturing, loans due back, and the wishlist items
 * planned for the month (shown on its first day).
 */
export function useMonthEvents(month: string): { days: DaySummary[]; keyDates: DayEvent[]; obligations: TaxObligation[] } {
  const { state } = useStore();
  const { t, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const accountById = new Map(state.savings.map((a) => [a.id, a]));
  const subById = new Map(state.subscriptions.map((s) => [s.id, s]));
  const inMonth = (date: string) => monthOf(date) === month;
  const year = Number(month.slice(0, 4));

  const events: DayEvent[] = [];
  for (const tx of state.transactions) {
    if (!inMonth(tx.date)) continue;
    const cat = catById.get(tx.categoryId);
    const sub = tx.subscriptionId ? subById.get(tx.subscriptionId) : undefined;
    if (tx.type === "transfer") {
      events.push({
        id: tx.id,
        date: tx.date,
        kind: "transfer",
        icon: "⇄",
        title: `${accountById.get(tx.accountId ?? "")?.name ?? "?"} → ${accountById.get(tx.toAccountId ?? "")?.name ?? "?"}`,
        amount: tx.amount,
        currency: tx.currency,
        tx,
      });
      continue;
    }
    events.push({
      id: tx.id,
      date: tx.date,
      kind: tx.type,
      icon: sub?.icon ?? cat?.icon ?? "❓",
      title: sub?.name ?? tx.note ?? category(cat),
      subtitle: sub || tx.note ? category(cat) : undefined,
      amount: tx.amount,
      currency: tx.currency,
      tx,
    });
  }

  const obligations = [...taxObligations(state, year - 1), ...taxObligations(state, year)].filter((o) => inMonth(o.due));
  const paid = settings.taxPaid ?? {};
  const periodLabel = (period: string) => {
    const quarter = /^(\d{4})-Q(\d)$/.exec(period);
    if (quarter) return t("taxcal.quarter", { q: quarter[2], year: quarter[1] });
    return /^\d{4}-\d{2}$/.test(period) ? formatMonth(period) : period;
  };
  const keyDates: DayEvent[] = [];
  for (const o of obligations) {
    keyDates.push({
      id: `tax:${o.id}`,
      date: o.due,
      kind: "tax",
      icon: "🧾",
      title: t(`taxcal.${o.kind}`, { period: periodLabel(o.period) }),
      subtitle: paid[o.id] ? t("taxcal.paid") : undefined,
      amount: o.amount,
      currency: "UAH",
    });
  }
  for (const inv of state.investments) {
    if (inv.endDate && inMonth(inv.endDate)) {
      keyDates.push({ id: `inv:${inv.id}`, date: inv.endDate, kind: "maturity", icon: "📜", title: inv.name, subtitle: t("balance.inv.matures") });
    }
  }
  for (const r of state.receivables) {
    if (r.dueDate && inMonth(r.dueDate) && r.repaid < r.amount) {
      keyDates.push({
        id: `rec:${r.id}`,
        date: r.dueDate,
        kind: "receivable",
        icon: r.icon,
        title: r.name,
        subtitle: t("receivables.title"),
        amount: r.amount - r.repaid,
        currency: r.currency,
      });
    }
  }
  for (const w of state.wishlist) {
    if (w.month === month) {
      keyDates.push({ id: `wish:${w.id}`, date: dateInMonth(month, 1), kind: "wish", icon: w.icon, title: w.name, subtitle: t("wish.title"), amount: w.price, currency: w.currency });
    }
  }
  keyDates.sort((a, b) => a.date.localeCompare(b.date));

  const days: DaySummary[] = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = dateInMonth(month, i + 1);
    const own = [...events.filter((e) => e.date === date), ...keyDates.filter((e) => e.date === date)];
    const inBase = (e: DayEvent) => convert(e.amount ?? 0, e.currency ?? base, base, settings.rates);
    const spent = own.filter((e) => e.kind === "expense").reduce((sum, e) => sum + inBase(e), 0);
    const earned = own.filter((e) => e.kind === "income").reduce((sum, e) => sum + inBase(e), 0);
    return { date, events: own, net: earned - spent, spent };
  });

  return { days, keyDates, obligations };
}
