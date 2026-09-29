"use client";

import { useState } from "react";
import { AddButton, Button, Card, EmptyState, FilterPills, Icon, IconDisc, Money, SortSelect, SummaryPanel, Toolbar, Unit } from "@/components/ui";
import { suggestSubscriptions, type SubscriptionSuggestion } from "@/lib/finance/import";
import { SUBSCRIPTION_SLOT } from "@/lib/constants";
import { formatMonth, todayISO } from "@/lib/date";
import {
  subscriptionBillsIn,
  subscriptionMonthlyCost,
  subscriptionsMonthlyTotal,
  subscriptionStatus,
  type SubscriptionStatus,
} from "@/lib/finance/finmath";
import { formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { oneOf, sortItems, usePersistentState } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Subscription } from "@/lib/types";
import { StatusBadge } from "./shared";
import { SubscriptionSheet } from "./subscription-sheet";

type SubView = "now" | "upcoming" | "ended" | "paused" | "all";
type SubSort = "name" | "price" | "day";

const VIEW_STATUS: Record<Exclude<SubView, "all">, SubscriptionStatus> = {
  now: "active",
  upcoming: "upcoming",
  ended: "ended",
  paused: "paused",
};

export function SubscriptionsCard({ month }: { month: string }) {
  const { state } = useStore();
  const { t, tp } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const [suggested, setSuggested] = useState<SubscriptionSuggestion | null>(null);
  const [dismissed, setDismissed] = usePersistentState<string[]>(
    "subs.dismissed",
    [],
    (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string"),
  );
  const suggestions = suggestSubscriptions(state, todayISO())
    .filter((s) => !dismissed.includes(s.key))
    .slice(0, 3);

  const [view, setView] = useState<SubView>("now");
  const [sort, setSort] = usePersistentState<SubSort>("subs.sort", "name", oneOf(["name", "price", "day"] as const));
  const [dir, setDir] = usePersistentState<"asc" | "desc">("subs.dir", "asc", oneOf(["asc", "desc"] as const));
  const [target, setTarget] = useState<Subscription | "new" | null>(null);

  const slot = state.categories.find((c) => c.id === "cat-subs")?.colorSlot ?? SUBSCRIPTION_SLOT;
  const monthSubs = state.subscriptions.filter((sub) => subscriptionBillsIn(sub, month));
  const total = subscriptionsMonthlyTotal(monthSubs, base, settings);
  const counts: Record<SubscriptionStatus, number> = { active: 0, upcoming: 0, ended: 0, paused: 0 };
  for (const sub of state.subscriptions) counts[subscriptionStatus(sub, month)]++;

  const visible = sortItems(
    state.subscriptions.filter((sub) => view === "all" || subscriptionStatus(sub, month) === VIEW_STATUS[view]),
    (sub) =>
      sort === "price" ? subscriptionMonthlyCost(sub, base, settings) : sort === "day" ? sub.dayOfMonth : sub.name.toLocaleLowerCase(),
    dir,
  );
  const viewOptions = (
    [
      { value: "now", label: t("tx.subs.view.now"), count: counts.active },
      { value: "upcoming", label: t("tx.subs.view.upcoming"), count: counts.upcoming },
      { value: "ended", label: t("tx.subs.view.ended"), count: counts.ended },
      { value: "paused", label: t("tx.subs.view.paused"), count: counts.paused },
      { value: "all", label: t("tx.subs.view.all"), count: state.subscriptions.length },
    ] as Array<{ value: SubView; label: string; count: number }>
  ).filter((o) => o.value === "now" || o.value === "all" || o.count > 0 || o.value === view);

  const add = () => setTarget("new");

  return (
    <Card
      title={t("tx.subs")}
      subtitle={t("tx.subs.subtitle")}
      icon="device"
      action={<AddButton onClick={add} label={t("common.add")} />}
    >
      {suggestions.length > 0 && (
        <div className="mb-3 rounded-field border border-accent/25 bg-accent-soft p-2.5">
          <p className="card-title mb-1.5">{t("tx.subs.suggest.title")}</p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-1">{s.name}</span>
                  <span className="block text-xs text-ink-3">
                    {formatMoney(s.amount, s.currency)} · {tp("tx.subs.suggest.seen", s.months)}
                  </span>
                </span>
                <Button size="sm" onClick={() => setSuggested(s)}>
                  {t("common.add")}
                </Button>
                <button
                  type="button"
                  onClick={() => setDismissed([...dismissed, s.key])}
                  aria-label={t("tx.subs.suggest.dismiss")}
                  title={t("tx.subs.suggest.dismiss")}
                  className="icon-btn size-8 shrink-0 text-ink-3"
                >
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.subscriptions.length === 0 ? (
        <EmptyState
          icon={<Icon name="device" />}
          title={t("tx.subs.empty")}
          hint={t("tx.subs.empty.hint")}
          action={<AddButton onClick={add} label={t("common.add")} />}
        />
      ) : (
        <>
          <SummaryPanel
            className="mb-3"
            value={
              <>
                {formatMoney(total, base, { exact: true })}
                <Unit>{t("common.perMonth")}</Unit>
              </>
            }
            meta={`${formatMonth(month)} · ${t("tx.subs.countOf", { n: monthSubs.length, total: state.subscriptions.length })}`}
          >
            <p className="caption tnum">{t("tx.subs.perYear", { amount: formatMoney(total * 12, base, { compact: true }) })}</p>
          </SummaryPanel>
          <Toolbar>
            <FilterPills label={t("tx.subs.view")} options={viewOptions} value={view} onChange={setView} />
            {visible.length > 1 && (
              <SortSelect
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name", label: t("sort.name") },
                  { value: "price", label: t("sort.price") },
                  { value: "day", label: t("sort.chargeDay") },
                ]}
                direction={dir}
                onDirectionChange={setDir}
              />
            )}
          </Toolbar>
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-2">
              {view === "now" ? t("tx.subs.noneThisMonth", { month: formatMonth(month) }) : t("filter.noMatches")}
            </p>
          ) : (
            <ul className="rows">
              {visible.map((sub) => {
                const status = subscriptionStatus(sub, month);
                return (
                  <li key={sub.id}>
                    <button
                      type="button"
                      onClick={() => setTarget(sub)}
                      className={`row-tap flex w-full min-w-0 items-center gap-3 px-2.5 py-2 text-left ${
                        status === "active" ? "" : "opacity-60"
                      }`}
                    >
                      <IconDisc colorSlot={slot} className="size-9 rounded-full text-base">
                        {sub.icon}
                      </IconDisc>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink-1">{sub.name}</span>
                          <StatusBadge status={status} />
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {sub.period === "yearly"
                            ? t("tx.subs.yearly", { price: formatMoney(sub.price, sub.currency) })
                            : t("tx.subs.monthlyDay", { day: sub.dayOfMonth })}
                          {status === "upcoming" && ` · ${t("tx.subs.from", { month: formatMonth(sub.startMonth) })}`}
                          {sub.endMonth &&
                            ` · ${
                              status === "ended"
                                ? t("tx.subs.endedIn", { month: formatMonth(sub.endMonth) })
                                : t("tx.subs.until", { month: formatMonth(sub.endMonth) })
                            }`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Money
                          amount={sub.period === "yearly" ? sub.price / 12 : sub.price}
                          currency={sub.currency}
                          exact
                          className="block whitespace-nowrap text-sm font-semibold text-ink-1"
                        />
                        <span className="block text-xs text-ink-3">{t("common.perMonth")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {target && (
        <SubscriptionSheet key={target === "new" ? "new" : target.id} target={target} onClose={() => setTarget(null)} />
      )}
      {suggested && (
        <SubscriptionSheet key={`suggested:${suggested.key}`} target="new" draft={{ ...suggested, price: suggested.amount }} onClose={() => setSuggested(null)} />
      )}
    </Card>
  );
}
