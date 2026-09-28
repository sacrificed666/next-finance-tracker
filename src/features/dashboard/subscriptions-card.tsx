"use client";

import { Card, CardLink, EmptyState, Icon, IconDisc, LinkButton, Money } from "@/components/ui";
import { SUBSCRIPTION_SLOT } from "@/lib/constants";
import { addMonths, dateInMonth, formatDateShort } from "@/lib/date";
import { subscriptionBillsIn, subscriptionsMonthlyTotal } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useMonthSummary } from "./use-month-summary";

const TOP = 5;

/** The priciest subscriptions billing this month and when each charges next. */
export function SubscriptionsCard({ className = "" }: { className?: string }) {
  const { state, settings, base, month, today, series } = useMonthSummary();
  const { t } = useT();

  const monthSubs = state.subscriptions.filter((s) => subscriptionBillsIn(s, month));
  const total = subscriptionsMonthlyTotal(monthSubs, base, settings);
  const slot = state.categories.find((c) => c.id === "cat-subs")?.colorSlot ?? SUBSCRIPTION_SLOT;
  const monthly = (s: (typeof monthSubs)[number]) =>
    convert(s.period === "yearly" ? s.price / 12 : s.price, s.currency, base, settings.rates);
  const top = [...monthSubs].sort((a, b) => monthly(b) - monthly(a)).slice(0, TOP);

  const nextCharge = (sub: { dayOfMonth: number; endMonth?: string }) => {
    const thisMonth = dateInMonth(month, sub.dayOfMonth);
    if (thisMonth >= today) return thisMonth;
    const nextMonth = addMonths(month, 1);
    if (sub.endMonth && sub.endMonth < nextMonth) return null;
    return dateInMonth(nextMonth, sub.dayOfMonth);
  };

  const spending = series.filter((m) => m.expense > 0);
  const avgExpense = spending.length ? spending.reduce((s, m) => s + m.expense, 0) / spending.length : 0;
  const share = avgExpense > 0 ? (total / avgExpense) * 100 : 0;

  return (
    <Card title={t("tx.subs")} icon="device" action={<CardLink href="/transactions" />} className={className}>
      {monthSubs.length > 0 ? (
        <>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="num-md whitespace-nowrap text-ink-1">
                {formatMoney(total, base, { compact: true })}
                <span className="text-sm font-medium text-ink-3">{t("common.perMonth")}</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {t("dash.subs.summary", { n: monthSubs.length, year: formatMoney(total * 12, base, { compact: true }) })}
              </p>
            </div>
            {share > 0 && (
              <span className="shrink-0 rounded-full bg-ghost px-2.5 py-1 text-xs font-semibold text-ink-2">
                {t("dash.subs.share", { pct: formatPercent(share, 0) })}
              </span>
            )}
          </div>
          <table className="data-table table-fixed">
            <colgroup>
              <col />
              <col className="w-18" />
              <col className="w-26" />
            </colgroup>
            <thead>
              <tr>
                <th className="text-left">{t("dash.subs.service")}</th>
                <th className="truncate text-right">{t("dash.subs.next")}</th>
                <th className="truncate text-right">{t("dash.subs.perMonth")}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((sub) => {
                const next = nextCharge(sub);
                return (
                  <tr key={sub.id}>
                    <td>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <IconDisc colorSlot={slot} className="size-8 rounded-full text-sm">
                          {sub.icon}
                        </IconDisc>
                        <span className="min-w-0">
                          <span className="block truncate text-ink-1">{sub.name}</span>
                          {sub.period === "yearly" && <span className="block text-xs text-ink-3">{t("dash.subs.yearly")}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="tnum whitespace-nowrap text-right text-xs text-ink-2">
                      {next ? formatDateShort(next) : t("dash.subs.lastCharge")}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Money
                        amount={sub.period === "yearly" ? sub.price / 12 : sub.price}
                        currency={sub.currency}
                        exact
                        className="font-medium text-ink-1"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {monthSubs.length > top.length && (
            <p className="mt-2 text-xs text-ink-3">{t("dash.subs.more", { n: monthSubs.length - top.length })}</p>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Icon name="device" />}
          title={t("dash.subs.empty")}
          hint={t("dash.subs.empty.hint")}
          action={<LinkButton href="/transactions">{t("dash.subs.add")}</LinkButton>}
        />
      )}
    </Card>
  );
}
