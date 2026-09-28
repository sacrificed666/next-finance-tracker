"use client";

import { useDeferredValue, useState } from "react";
import { HeroSplit, SparkArea } from "@/components/charts";
import { PageHero } from "@/components/layout/hero";
import { PageBody, Split } from "@/components/layout/page";
import { Card, Icon, IconDisc, Money, PageHeader, SegmentedControl } from "@/components/ui";
import { addMonths, currentMonth, daysInMonth, formatDateShort, formatMonth, formatMonthShort, todayISO } from "@/lib/date";
import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import { PERIOD_MONTHS, periodStart, useReport, type ReportPeriod } from "./use-report";

const rate = (income: number, net: number) => (income > 0 ? (net / income) * 100 : 0);
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatNumber(Math.abs(v), 1)}`;

/** Where the money went over a month, a quarter or a year, against the period before. */
export function ReportsPage() {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const base = state.settings.baseCurrency;
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [anchor, setAnchor] = useState(currentMonth());
  // The period controls answer at once; the cards below catch up in the background.
  const shownPeriod = useDeferredValue(period);
  const shownAnchor = useDeferredValue(anchor);
  const r = useReport(shownPeriod, shownAnchor);
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const money = (v: number, sign = false) => formatMoney(v, base, { compact: true, sign });

  const labelFor = (p: ReportPeriod, from: string) =>
    p === "month"
      ? formatMonth(from)
      : p === "quarter"
        ? t("taxcal.quarter", { q: Math.floor(Number(from.slice(5)) / 3) + 1, year: from.slice(0, 4) })
        : from.slice(0, 4);
  const label = (from: string) => labelFor(shownPeriod, from);
  const step = (dir: 1 | -1) => setAnchor(addMonths(periodStart(period, anchor), dir * PERIOD_MONTHS[period]));
  const atLatest = periodStart(period, anchor) >= periodStart(period, currentMonth());
  const vsPrev = (now: number, before: number, lowerIsBetter = false) =>
    before !== 0 || now !== 0
      ? {
          text: t("reports.vsPrev", { delta: money(now - before, true) }),
          good: lowerIsBetter ? now <= before : now >= before,
        }
      : undefined;

  const cats = [...r.current.byCategory.entries()]
    .map(([id, value]) => ({ id, value, before: r.previous.byCategory.get(id) ?? 0 }))
    .concat(
      [...r.previous.byCategory.entries()]
        .filter(([id]) => !r.current.byCategory.has(id))
        .map(([id, before]) => ({ id, value: 0, before })),
    )
    .sort((a, b) => b.value - a.value);
  const top = cats.filter((c) => c.value > 0);
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.value, c.before)));
  const changes = cats.filter((c) => Math.abs(c.value - c.before) > 0.5).sort((a, b) => b.value - b.before - (a.value - a.before));
  const rises = changes.filter((c) => c.value > c.before).slice(0, 3);
  const falls = changes.filter((c) => c.value < c.before).reverse().slice(0, 3);
  const days = r.current.months.reduce((sum, m) => sum + daysInMonth(m), 0);
  const elapsedDays = r.current.months.reduce(
    (sum, m) => sum + (m === currentMonth() ? Number(todayISO().slice(8)) : m < currentMonth() ? daysInMonth(m) : 0),
    0,
  );
  const tags = [...r.current.byTag.entries()].sort((a, b) => b[1] - a[1]);
  const active = r.year.filter((m) => m.income > 0 || m.expense > 0);
  const best = active.reduce<(typeof active)[number] | null>((b, m) => (!b || m.net > b.net ? m : b), null);
  const worst = active.reduce<(typeof active)[number] | null>((b, m) => (!b || m.net < b.net ? m : b), null);

  const catName = (id: string) => {
    const cat = catById.get(id);
    return { icon: cat?.icon ?? "❓", name: category(cat), slot: cat?.colorSlot };
  };

  return (
    <>
      <PageHeader
        title={t("nav.reports")}
        subtitle={t("reports.subtitle")}
        action={
          <SegmentedControl
            label={t("reports.period")}
            options={[
              { value: "month" as const, label: t("reports.period.month") },
              { value: "quarter" as const, label: t("reports.period.quarter") },
              { value: "year" as const, label: t("reports.period.year") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />
      <PageBody>
        <PageHero
          icon="chart"
          label={label(r.start)}
          action={
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t("month.previous")} onClick={() => step(-1)} className="icon-btn size-9 border border-hairline bg-ghost text-ink-2">
                <Icon name="chevronLeft" size={18} strokeWidth={2.2} />
              </button>
              <span className="min-w-28 text-center text-sm font-semibold text-ink-1">{labelFor(period, periodStart(period, anchor))}</span>
              <button
                type="button"
                aria-label={t("month.next")}
                onClick={() => step(1)}
                disabled={atLatest}
                className="icon-btn size-9 border border-hairline bg-ghost text-ink-2 disabled:opacity-40"
              >
                <Icon name="chevronRight" size={18} strokeWidth={2.2} />
              </button>
            </div>
          }
          value={formatMoney(r.current.net, base, { sign: true })}
          sub={
            r.current.income > 0
              ? t("reports.kept", { pct: formatPercent(rate(r.current.income, r.current.net), 0) })
              : undefined
          }
          delta={vsPrev(r.current.net, r.previous.net)}
          note={t("reports.against", { period: label(r.prevStart) })}
          aside={
            top.length > 0 ? (
              <HeroSplit
                title={t("reports.where")}
                segments={top.slice(0, 6).map((c) => ({
                  id: c.id,
                  label: catName(c.id).name,
                  icon: catName(c.id).icon,
                  value: c.value,
                  colorSlot: catName(c.id).slot ?? 3,
                }))}
                currency={base}
              />
            ) : undefined
          }
          stats={[
            {
              label: t("tx.stat.income"),
              icon: "arrowDown",
              value: money(r.current.income),
              tone: "income",
              delta: vsPrev(r.current.income, r.previous.income),
            },
            {
              label: t("tx.stat.expenses"),
              icon: "spend",
              value: money(r.current.expense),
              tone: "expense",
              delta: vsPrev(r.current.expense, r.previous.expense, true),
            },
            {
              label: t("dash.savingsRate"),
              icon: "percent",
              value: r.current.income > 0 ? formatPercent(rate(r.current.income, r.current.net)) : "—",
              delta:
                r.current.income > 0 && r.previous.income > 0
                  ? {
                      text: t("reports.pp", {
                        delta: signed(rate(r.current.income, r.current.net) - rate(r.previous.income, r.previous.net)),
                      }),
                      good: rate(r.current.income, r.current.net) >= rate(r.previous.income, r.previous.net),
                    }
                  : undefined,
            },
            {
              label: t("tx.stat.daily"),
              icon: "calendar",
              value: elapsedDays > 0 ? money(r.current.expense / elapsedDays) : "—",
              hint: tp("calendar.days", days),
            },
          ]}
        />
        <Split
          main={
            <>
              <Card title={t("reports.compared")} subtitle={t("reports.compared.subtitle", { period: label(r.prevStart) })} icon="bars">
                {cats.length === 0 ? (
                  <p className="caption">{t("tx.where.empty")}</p>
                ) : (
                  <div className="-mx-1 overflow-x-auto px-1">
                    <table className="data-table min-w-120">
                      <thead>
                        <tr>
                          <th className="text-left">{t("common.category")}</th>
                          <th className="w-[34%] text-right">{label(r.start)}</th>
                          <th className="text-right">{label(r.prevStart)}</th>
                          <th className="text-right">{t("reports.change")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cats.slice(0, 12).map((c) => {
                          const diff = c.value - c.before;
                          const pct = c.before > 0 ? (diff / c.before) * 100 : null;
                          const { icon, name } = catName(c.id);
                          return (
                            <tr key={c.id}>
                              <td>
                                <span className="flex min-w-0 items-center gap-2">
                                  <span aria-hidden>{icon}</span>
                                  <span className="truncate text-ink-1">{name}</span>
                                </span>
                              </td>
                              <td className="text-right">
                                <span className="flex items-center justify-end gap-2.5">
                                  <span aria-hidden className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-ghost-2 sm:block">
                                    <span className="block h-full rounded-full bg-expense" style={{ width: `${(c.value / maxCat) * 100}%` }} />
                                  </span>
                                  <span className="tnum w-18 shrink-0 font-semibold text-ink-1">{money(c.value)}</span>
                                </span>
                              </td>
                              <td className="tnum text-right text-ink-3">{money(c.before)}</td>
                              <td className={`tnum text-right text-xs font-semibold ${diff > 0.5 ? "text-expense" : diff < -0.5 ? "text-income" : "text-ink-3"}`}>
                                {Math.abs(diff) <= 0.5 ? "—" : pct !== null ? `${diff > 0 ? "+" : "−"}${formatPercent(Math.abs(pct), 0)}` : t("reports.new")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              {top.length > 0 && (
                <Card title={t("reports.trends")} subtitle={t("reports.trends.subtitle")} icon="trend">
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {top.slice(0, 6).map((c) => {
                      const trend = r.trendOf(c.id);
                      const avg = trend.reduce((s, v) => s + v, 0) / Math.max(1, trend.filter((v) => v > 0).length);
                      const { icon, name } = catName(c.id);
                      const last = trend[trend.length - 1];
                      return (
                        <li key={c.id} className="relative overflow-hidden rounded-field bg-ghost px-3 pb-12 pt-2.5">
                          <p className="flex items-center gap-1.5 text-xs text-ink-3">
                            <span aria-hidden>{icon}</span>
                            <span className="truncate">{name}</span>
                          </p>
                          <p className="num-sm mt-0.5 text-ink-1">{money(last)}</p>
                          <p className={`text-[11px] ${last > avg ? "text-expense" : "text-income"}`}>
                            {t("reports.vsAvg", { delta: money(last - avg, true) })}
                          </p>
                          <SparkArea values={trend} tone="expense" height={40} />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </>
          }
          side={
            <>
              {(rises.length > 0 || falls.length > 0) && (
                <Card title={t("reports.changes")} subtitle={t("reports.compared.subtitle", { period: label(r.prevStart) })} icon="exchange">
                  <ul className="rows">
                    {[...rises, ...falls].map((c) => {
                      const { icon, name } = catName(c.id);
                      const diff = c.value - c.before;
                      return (
                        <li key={c.id} className="flex items-center gap-2.5 px-2.5 py-2">
                          <Icon name="trend" size={14} className={diff > 0 ? "text-expense" : "-scale-y-100 text-income"} />
                          <span aria-hidden>{icon}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{name}</span>
                          <span className={`tnum text-sm font-semibold ${diff > 0 ? "text-expense" : "text-income"}`}>{money(diff, true)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              {r.largest.length > 0 && (
                <Card title={t("reports.largest")} subtitle={label(r.start)} icon="receipt">
                  <ul className="rows">
                    {r.largest.map(({ tx }) => {
                      const { icon, name, slot } = catName(tx.categoryId);
                      return (
                        <li key={tx.id} className="flex items-center gap-2.5 px-2.5 py-2">
                          <IconDisc colorSlot={slot} className="size-8 rounded-full text-sm">
                            {icon}
                          </IconDisc>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink-1">{tx.note || name}</span>
                            <span className="block text-xs text-ink-3">{formatDateShort(tx.date)}</span>
                          </span>
                          <Money amount={-tx.amount} currency={tx.currency} sign compact className="shrink-0 text-sm font-semibold text-expense" />
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              {tags.length > 0 && (
                <Card title={t("reports.tags")} subtitle={label(r.start)} icon="tag">
                  <ul className="rows">
                    {tags.map(([tag, value]) => (
                      <li key={tag} className="flex items-center justify-between gap-3 px-2.5 py-2 text-sm">
                        <span className="font-semibold text-accent">#{tag}</span>
                        <span className="tnum font-semibold text-ink-1">{money(value)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {period === "year" && best && worst && (
                <Card title={t("reports.review")} subtitle={label(r.start)} icon="star">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-field bg-ghost p-3">
                      <p className="caption">{t("reports.bestMonth")}</p>
                      <p className="num-sm mt-1 text-income">{money(best.net, true)}</p>
                      <p className="caption">{formatMonthShort(best.month)}</p>
                    </div>
                    <div className="rounded-field bg-ghost p-3">
                      <p className="caption">{t("reports.worstMonth")}</p>
                      <p className={`num-sm mt-1 ${worst.net < 0 ? "text-expense" : "text-ink-1"}`}>{money(worst.net, true)}</p>
                      <p className="caption">{formatMonthShort(worst.month)}</p>
                    </div>
                  </div>
                  <p className="caption mt-2">
                    {t("reports.inThePlus", { n: active.filter((m) => m.net > 0).length, total: active.length })}
                  </p>
                </Card>
              )}
            </>
          }
        />
      </PageBody>
    </>
  );
}
