"use client";

import { useDeferredValue, useState } from "react";
import { PageHero, type HeroStat } from "@/components/layout/hero";
import { PageBody, Split } from "@/components/layout/page";
import { AddButton, Card, IconDisc, Money, PageHeader, SummaryPanel } from "@/components/ui";
import { currentMonth, dateInMonth, formatDate, formatDateShort, formatMonth, formatWeekday, monthOf, todayISO } from "@/lib/date";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Transaction } from "@/lib/types";
import { MonthSwitcher } from "@/features/transactions/month-switcher";
import { TransactionSheet } from "@/features/transactions/transaction-sheet";
import { KIND_COLOR, useMonthEvents, type DayEvent } from "./use-month-events";

/** A Monday, for the weekday row: 2024-01-01 was one. */
const WEEK = Array.from({ length: 7 }, (_, i) => `2024-01-0${i + 1}`);

function EventRow({ event, onOpen }: { event: DayEvent; onOpen?: () => void }) {
  const tone =
    event.kind === "expense" ? "text-expense" : event.kind === "income" ? "text-income" : "text-ink-1";
  const body = (
    <>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[event.kind] }} />
      <IconDisc className="size-8 rounded-full text-sm">{event.icon}</IconDisc>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink-1">{event.title}</span>
        {event.subtitle && <span className="block truncate text-xs text-ink-3">{event.subtitle}</span>}
      </span>
      {event.amount !== undefined && event.currency && (
        <Money
          amount={event.kind === "expense" ? -event.amount : event.amount}
          currency={event.currency}
          sign={event.kind === "expense" || event.kind === "income"}
          compact
          className={`shrink-0 whitespace-nowrap text-sm font-semibold ${tone}`}
        />
      )}
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="row-tap flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-2.5 py-2">{body}</div>
      )}
    </li>
  );
}

/** The month as a calendar: what happens on each day, and the dates worth knowing about. */
export function CalendarPage() {
  const { state } = useStore();
  const { t, tp } = useT();
  const base = state.settings.baseCurrency;
  const today = todayISO();
  const [chosen, setMonth] = useState(currentMonth());
  // The switcher answers at once; the grid redraws in the background.
  const month = useDeferredValue(chosen);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Transaction | "new" | null>(null);
  const { days, keyDates, obligations } = useMonthEvents(month);

  const selected = picked && monthOf(picked) === month ? picked : monthOf(today) === month ? today : dateInMonth(month, 1);
  const day = days.find((d) => d.date === selected)!;
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const maxSpend = Math.max(1, ...days.map((d) => d.spent));

  const net = days.reduce((sum, d) => sum + d.net, 0);
  const earnedOn = (d: (typeof days)[number]) => Math.max(0, d.net + d.spent);
  const ahead = days.filter((d) => d.date > today);
  const aheadOut = ahead.reduce((sum, d) => sum + d.spent, 0);
  const aheadIn = ahead.reduce((sum, d) => sum + earnedOn(d), 0);
  const unpaid = obligations.filter((o) => !state.settings.taxPaid?.[o.id]);
  const taxDue = unpaid.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const busiest = days.reduce((best, d) => (d.spent > best.spent ? d : best), days[0]);
  const entries = days.reduce((sum, d) => sum + d.events.filter((e) => e.tx).length, 0);

  // What is still planned when the month has any; otherwise what the month came to.
  // A figure with nothing in it is left out rather than shown as a dash.
  const stats: HeroStat[] = [];
  if (aheadOut > 0 || aheadIn > 0) {
    if (aheadOut > 0) {
      stats.push({
        label: t("calendar.stillOut"),
        icon: "spend",
        value: formatMoney(aheadOut, base, { compact: true }),
        tone: "expense",
        hint: tp("calendar.days", ahead.filter((d) => d.spent > 0).length),
      });
    }
    if (aheadIn > 0) {
      stats.push({
        label: t("calendar.stillIn"),
        icon: "arrowDown",
        value: formatMoney(aheadIn, base, { compact: true }),
        tone: "income",
        hint: tp("calendar.days", ahead.filter((d) => earnedOn(d) > 0).length),
      });
    }
  } else {
    const spent = days.reduce((sum, d) => sum + d.spent, 0);
    const earned = days.reduce((sum, d) => sum + earnedOn(d), 0);
    if (spent > 0) {
      stats.push({ label: t("tx.stat.expenses"), icon: "spend", value: formatMoney(spent, base, { compact: true }), tone: "expense" });
    }
    if (earned > 0) {
      stats.push({ label: t("tx.stat.income"), icon: "arrowDown", value: formatMoney(earned, base, { compact: true }), tone: "income" });
    }
  }
  if (unpaid.length > 0) {
    stats.push({
      label: t("calendar.taxes"),
      icon: "receipt",
      value: taxDue > 0.5 ? formatMoney(taxDue, "UAH", { compact: true }) : tp("calendar.deadlines", unpaid.length),
      hint: taxDue > 0.5 ? tp("calendar.deadlines", unpaid.length) : undefined,
    });
  }
  if (busiest.spent > 0) {
    stats.push({
      label: t("calendar.busiest"),
      icon: "flame",
      value: formatDateShort(busiest.date),
      hint: formatMoney(busiest.spent, base, { compact: true }),
    });
  }

  return (
    <>
      <PageHeader
        title={t("nav.calendar")}
        subtitle={t("calendar.subtitle")}
        action={<AddButton variant="primary" onClick={() => setSheet("new")} label={t("common.add")} />}
      />
      <PageBody>
        <PageHero
          icon="calendar"
          label={formatMonth(month)}
          action={<MonthSwitcher month={chosen} onChange={setMonth} />}
          value={formatMoney(net, base, { sign: true })}
          sub={t("calendar.net")}
          note={tp("common.entries", entries)}
          stats={stats}
        />
        <Split
          main={
            <Card title={t("calendar.month")} subtitle={t("calendar.month.subtitle")} icon="calendar">
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEK.map((d) => (
                  <span key={d} className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {formatWeekday(d)}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden />
                ))}
                {days.map((d) => {
                  const isToday = d.date === today;
                  const isPicked = d.date === selected;
                  const kinds = [...new Set(d.events.map((e) => e.kind))].slice(0, 4);
                  return (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setPicked(d.date)}
                      aria-pressed={isPicked}
                      aria-label={`${formatDate(d.date)}${d.events.length ? ` · ${tp("common.entries", d.events.length)}` : ""}`}
                      className={`relative flex min-h-16 flex-col items-stretch overflow-hidden rounded-field p-1.5 text-left transition-colors sm:min-h-20 ${
                        isPicked ? "bg-accent-soft ring-1 ring-accent/50" : d.date < today ? "bg-ghost/60 hover:bg-fill-hover" : "bg-ghost hover:bg-fill-hover"
                      }`}
                    >
                      {/* How much went out that day, as a wash rising from the bottom. */}
                      {d.spent > 0 && (
                        <span
                          aria-hidden
                          className="absolute inset-x-0 bottom-0 bg-expense/12"
                          style={{ height: `${Math.max(8, (d.spent / maxSpend) * 70)}%` }}
                        />
                      )}
                      <span
                        className={`relative flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday ? "bg-accent text-(--on-accent)" : d.date < today ? "text-ink-3" : "text-ink-1"
                        }`}
                      >
                        {Number(d.date.slice(8))}
                      </span>
                      <span className="relative mt-auto flex flex-wrap items-center gap-0.5">
                        {kinds.map((k) => (
                          <span key={k} aria-hidden className="size-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
                        ))}
                      </span>
                      {d.net !== 0 && (
                        <span
                          className={`tnum relative mt-0.5 hidden truncate text-[10px] font-semibold sm:block ${
                            d.net > 0 ? "text-income" : "text-ink-2"
                          }`}
                        >
                          {formatMoney(d.net, base, { compact: true, sign: true })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                {(["expense", "income", "tax", "maturity", "receivable", "wish"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
                    {t(`calendar.kind.${k}`)}
                  </li>
                ))}
              </ul>
            </Card>
          }
          side={
            <>
              <Card
                title={`${formatWeekday(day.date)}, ${formatDate(day.date)}`}
                subtitle={day.date === today ? t("calendar.today") : day.date > today ? t("calendar.ahead") : undefined}
                icon="calendar"
                action={<AddButton onClick={() => setSheet("new")} label={t("common.add")} />}
              >
                {day.events.length > 0 ? (
                  <>
                    <SummaryPanel
                      className="mb-3"
                      value={formatMoney(day.net, base, { sign: true })}
                      tone={day.net > 0 ? "income" : day.net < 0 ? "expense" : undefined}
                      meta={tp("common.entries", day.events.length)}
                    />
                    <ul className="rows">
                      {day.events.map((e) => (
                        <EventRow key={e.id} event={e} onOpen={e.tx ? () => setSheet(e.tx!) : undefined} />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="caption">{t("calendar.quiet")}</p>
                )}
              </Card>
              {keyDates.length > 0 && (
                <Card title={t("calendar.keyDates")} subtitle={formatMonth(month)} icon="target">
                  <ul className="rows">
                    {keyDates.map((e) => (
                      <EventRow key={e.id} event={{ ...e, subtitle: [formatDateShort(e.date), e.subtitle].filter(Boolean).join(" · ") }} />
                    ))}
                  </ul>
                </Card>
              )}
            </>
          }
        />
      </PageBody>

      {sheet && (
        <TransactionSheet
          key={sheet === "new" ? `new:${selected}` : sheet.id}
          target={sheet}
          month={month}
          date={sheet === "new" ? selected : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
