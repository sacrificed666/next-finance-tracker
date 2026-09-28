"use client";

import { useState } from "react";
import { BalanceLine, type BalancePoint } from "@/components/charts";
import { Card, IconDisc, Money, SegmentedControl, SummaryPanel } from "@/components/ui";
import { addDays, formatDateShort, formatWeekday } from "@/lib/date";
import { accountBalances } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import type { AccountKind, Transaction } from "@/lib/types";
import { useMonthSummary } from "./use-month-summary";

const SHOWN = 6;
/** Money you can spend today; coins and game items are not. */
const LIQUID = new Set<AccountKind>(["card", "cash", "savings", "wallet", "other"]);

/**
 * Cash and cards over the next month or two: today's balance plus everything
 * already scheduled — recurring rules, subscriptions, planned income — so a
 * shortfall shows up before it happens. The first payments are listed by day.
 */
export function CashAheadCard({ className = "" }: { className?: string }) {
  const { state, settings, base, today } = useMonthSummary();
  const { t, tp, category } = useT();
  const [days, setDays] = useState<30 | 60>(30);
  const until = addDays(today, days);
  const tomorrow = addDays(today, 1);
  const inBase = (tx: Transaction) => convert(tx.amount, tx.currency, base, settings.rates);

  const balances = accountBalances(state, today);
  const start = state.savings
    .filter((a) => LIQUID.has(a.kind))
    .reduce((sum, a) => sum + convert(balances.get(a.id) ?? 0, a.currency, base, settings.rates), 0);

  const upcoming = state.transactions
    .filter((tx) => tx.type !== "transfer" && tx.date > today && tx.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const changeOn = new Map<string, number>();
  for (const tx of upcoming) changeOn.set(tx.date, (changeOn.get(tx.date) ?? 0) + (tx.type === "income" ? 1 : -1) * inBase(tx));

  const points: BalancePoint[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const change = i === 0 ? 0 : (changeOn.get(date) ?? 0);
    points.push({ date, value: (points[i - 1]?.value ?? start) + change, change });
  }
  const lowest = points.reduce((best, p) => (p.value < best.value ? p : best), points[0]);
  const firstBelowZero = points.find((p) => p.value < 0);
  const end = points[points.length - 1];

  const nameOf = (tx: Transaction) => {
    const sub = tx.subscriptionId ? state.subscriptions.find((s) => s.id === tx.subscriptionId) : undefined;
    if (sub) return sub.name;
    return tx.note || category(state.categories.find((c) => c.id === tx.categoryId));
  };
  const iconOf = (tx: Transaction) => {
    const sub = tx.subscriptionId ? state.subscriptions.find((s) => s.id === tx.subscriptionId) : undefined;
    const cat = state.categories.find((c) => c.id === tx.categoryId);
    return { icon: sub?.icon ?? cat?.icon ?? "❓", slot: cat?.colorSlot };
  };
  const when = (date: string) =>
    date === tomorrow ? t("dash.upcoming.tomorrow") : `${formatWeekday(date)}, ${formatDateShort(date)}`;
  const byDay = new Map<string, Transaction[]>();
  for (const tx of upcoming.slice(0, SHOWN)) byDay.set(tx.date, [...(byDay.get(tx.date) ?? []), tx]);

  return (
    <Card
      title={t("dash.ahead", { days })}
      subtitle={t("dash.ahead.subtitle")}
      icon="calendar"
      action={
        <SegmentedControl
          size="sm"
          label={t("dash.ahead.horizon")}
          options={[
            { value: "30" as const, label: t("dash.ahead.days", { days: 30 }) },
            { value: "60" as const, label: t("dash.ahead.days", { days: 60 }) },
          ]}
          value={String(days) as "30" | "60"}
          onChange={(v) => setDays(v === "60" ? 60 : 30)}
        />
      }
      className={className}
    >
      <SummaryPanel
        className="mb-3"
        value={
          <>
            {formatMoney(end.value, base, { compact: true })}
            <span className="text-xs font-medium text-ink-3"> · {formatDateShort(end.date)}</span>
          </>
        }
        tone={end.value < 0 ? "expense" : undefined}
        meta={
          firstBelowZero ? (
            <span className="font-semibold text-expense">{t("dash.ahead.dips", { date: formatDateShort(firstBelowZero.date) })}</span>
          ) : (
            t("dash.ahead.lowest", { amount: formatMoney(lowest.value, base, { compact: true }), date: formatDateShort(lowest.date) })
          )
        }
      >
        <p className="caption tnum">
          {t("dash.ahead.now", { amount: formatMoney(start, base, { compact: true }) })} · {tp("common.entries", upcoming.length)}
        </p>
      </SummaryPanel>

      <BalanceLine
        points={points}
        currency={base}
        caption={t("dash.ahead.caption")}
        dateLabel={t("common.date")}
        valueLabel={t("dash.ahead.balance")}
        changeLabel={t("dash.ahead.change")}
      />

      {upcoming.length > 0 && (
        <div className="mt-3 space-y-2">
          {[...byDay].map(([date, rows]) => (
            <section key={date}>
              <h3 className="group-head">
                <span className="text-ink-1">{when(date)}</span>
                <span className="tnum">{formatMoney(changeOn.get(date) ?? 0, base, { compact: true, sign: true })}</span>
              </h3>
              <ul className="rows mt-1">
                {rows.map((tx) => {
                  const mark = iconOf(tx);
                  return (
                    <li key={tx.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                      <IconDisc colorSlot={mark.slot} className="size-7 rounded-full text-xs">
                        {mark.icon}
                      </IconDisc>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{nameOf(tx)}</span>
                      <Money
                        amount={tx.type === "expense" ? -tx.amount : tx.amount}
                        currency={tx.currency}
                        sign
                        className={`shrink-0 whitespace-nowrap text-sm font-semibold ${
                          tx.type === "income" ? "text-income" : "text-expense"
                        }`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {upcoming.length > SHOWN && (
            <p className="px-1 text-xs text-ink-3">{t("dash.upcoming.more", { n: upcoming.length - SHOWN })}</p>
          )}
        </div>
      )}
    </Card>
  );
}
