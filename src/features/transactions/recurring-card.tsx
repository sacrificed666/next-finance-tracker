"use client";

import { useState } from "react";
import { AddButton, Button, Callout, Card, EmptyState, FilterPills, Icon, IconDisc, SummaryPanel, Unit } from "@/components/ui";
import { addMonths, currentMonth, dateInMonth, formatDateShort, formatMonth, todayISO } from "@/lib/date";
import { looksLikeFixedPayment, plansBookedAsSpending } from "@/lib/finance/categories";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { sortItems } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { RecurringRule } from "@/lib/types";
import { RecurringSheet } from "./recurring-sheet";
import { StopPlansSheet } from "./stop-plans-sheet";
import { recurringStatus, StatusBadge, type RecurringView } from "./shared";

export function RecurringCard({ month }: { month: string }) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const [view, setView] = useState<RecurringView>("now");
  const [target, setTarget] = useState<RecurringRule | "new" | null>(null);
  const [stopping, setStopping] = useState(false);
  const catById = new Map(state.categories.map((c) => [c.id, c]));

  const counts: Record<Exclude<RecurringView, "all">, number> = { now: 0, upcoming: 0, ended: 0 };
  for (const rule of state.recurring) counts[recurringStatus(rule, month)]++;
  const visible = sortItems(
    state.recurring.filter((rule) => view === "all" || recurringStatus(rule, month) === view),
    (rule) => rule.dayOfMonth,
    "asc",
  );
  const viewOptions = (
    [
      { value: "now", label: t("tx.rec.view.now"), count: counts.now },
      { value: "upcoming", label: t("tx.rec.view.upcoming"), count: counts.upcoming },
      { value: "ended", label: t("tx.rec.view.ended"), count: counts.ended },
      { value: "all", label: t("tx.rec.view.all"), count: state.recurring.length },
    ] as Array<{ value: RecurringView; label: string; count: number }>
  ).filter((o) => o.value === "now" || o.value === "all" || o.count > 0 || o.value === view);

  const add = () => setTarget("new");
  const base = state.settings.baseCurrency;
  const active = state.recurring.filter((rule) => recurringStatus(rule, month) === "now");
  const monthly = active.reduce(
    (acc, rule) => {
      acc[rule.type === "income" ? "in" : "out"] += convert(rule.amount, rule.currency, base, state.settings.rates);
      return acc;
    },
    { in: 0, out: 0 },
  );
  const today = todayISO();
  const nowMonth = currentMonth();
  const booked = month === nowMonth ? plansBookedAsSpending(state, nowMonth) : [];
  const plans = booked.filter((r) => !looksLikeFixedPayment(catById.get(r.categoryId)));
  const nextPost =
    month === nowMonth
      ? active
          .map((rule) => {
            const date = dateInMonth(nowMonth, rule.dayOfMonth);
            return date > today ? date : dateInMonth(addMonths(nowMonth, 1), rule.dayOfMonth);
          })
          .sort()[0]
      : undefined;

  return (
    <Card
      title={t("tx.rec")}
      subtitle={t("tx.rec.subtitle")}
      icon="repeat"
      action={<AddButton onClick={add} label={t("common.add")} />}
    >
      {state.recurring.length === 0 ? (
        <EmptyState
          icon={<Icon name="repeat" />}
          title={t("tx.rec.empty")}
          hint={t("tx.rec.empty.hint")}
          action={<AddButton onClick={add} label={t("common.add")} />}
        />
      ) : (
        <>
          <SummaryPanel
            className="mb-3"
            value={
              <>
                {formatMoney(monthly.in - monthly.out, base, { compact: true, sign: true })}
                <Unit>{t("common.perMonth")}</Unit>
              </>
            }
            tone={monthly.in >= monthly.out ? "income" : "expense"}
            meta={[
              tp("settings.categories.rules", active.length),
              nextPost ? t("tx.rec.next", { date: formatDateShort(nextPost) }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {monthly.in > 0 && monthly.out > 0 && (
              <p className="caption tnum">
                <span className="text-expense">−{formatMoney(monthly.out, base, { compact: true })}</span>
                {" · "}
                <span className="text-income">+{formatMoney(monthly.in, base, { compact: true })}</span>
              </p>
            )}
          </SummaryPanel>
          {plans.length > 0 && (
            <Callout tone="tip" title={tp("tx.rec.plans.title", plans.length)} className="mb-3">
              <p>
                {t("tx.rec.plans.body", {
                  names: plans.map((r) => category(catById.get(r.categoryId))).join(", "),
                })}
              </p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setStopping(true)}>
                {t("tx.rec.plans.choose")}
              </Button>
            </Callout>
          )}
          {state.recurring.length > 1 && (
            <div className="mb-3">
              <FilterPills label={t("tx.rec.view")} options={viewOptions} value={view} onChange={setView} />
            </div>
          )}
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-2">
              {view === "now" ? t("tx.rec.noneThisMonth", { month: formatMonth(month) }) : t("filter.noMatches")}
            </p>
          ) : (
            <ul className="rows">
              {visible.map((rule) => {
                const cat = catById.get(rule.categoryId);
                const status = recurringStatus(rule, month);
                return (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => setTarget(rule)}
                      className={`row-tap flex w-full items-center gap-3 px-2.5 py-2 text-left ${status === "now" ? "" : "opacity-60"}`}
                    >
                      <IconDisc colorSlot={cat?.colorSlot} className="size-9 rounded-full text-base">
                        {cat?.icon ?? "❓"}
                      </IconDisc>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink-1">
                            {category(cat)}
                            {rule.note && <span className="font-normal text-ink-3"> · {rule.note}</span>}
                          </span>
                          <StatusBadge status={status} />
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {t("tx.subs.monthlyDay", { day: rule.dayOfMonth })}
                          {" · "}
                          {rule.endMonth
                            ? t("tx.rec.range", { from: formatMonth(rule.startMonth), to: formatMonth(rule.endMonth) })
                            : t("tx.rec.since", { from: formatMonth(rule.startMonth) })}
                        </span>
                      </span>
                      <span
                        className={`tnum shrink-0 whitespace-nowrap text-sm font-semibold ${
                          rule.type === "income" ? "text-income" : "text-ink-1"
                        }`}
                      >
                        {formatMoney(rule.type === "income" ? rule.amount : -rule.amount, rule.currency, { sign: true })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {target && <RecurringSheet key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />}
      {stopping && <StopPlansSheet rules={booked} onClose={() => setStopping(false)} />}
    </Card>
  );
}
