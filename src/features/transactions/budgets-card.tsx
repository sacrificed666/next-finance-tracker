"use client";

import { useState } from "react";
import { AddButton, Card, EmptyState, Icon, ProgressMeter, SummaryPanel } from "@/components/ui";
import { currentMonth, dateInMonth, daysInMonth, formatDateShort, formatMonth, todayISO } from "@/lib/date";
import { budgetLimit, spentInBudget } from "@/lib/finance/categories";
import { monthTotals } from "@/lib/finance/finmath";
import { convert, formatMoney, formatPercent } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { sortItems } from "@/lib/state/listing";
import { useStore } from "@/lib/state/store";
import type { Budget } from "@/lib/types";
import { BudgetSheet } from "./budget-sheet";

/** Per-category limits for the month being read, most used first. */
export function BudgetsCard({ month }: { month: string }) {
  const { state } = useStore();
  const { t, tp, category } = useT();
  const { settings } = state;
  const base = settings.baseCurrency;
  const [target, setTarget] = useState<Budget | "new" | null>(null);
  const catById = new Map(state.categories.map((c) => [c.id, c]));

  const spentOf = (b: Budget) => spentInBudget(state, b.categoryId, b.currency, month);
  const limitOf = (b: Budget) => budgetLimit(state, b, month);
  // Spending so far, run to the month's end: when a budget will run out at this pace.
  const today = todayISO();
  const elapsed = month === currentMonth() ? Number(today.slice(8)) : 0;
  const runsOutOn = (b: Budget) => {
    const spent = spentOf(b);
    const limit = limitOf(b);
    if (elapsed < 3 || spent <= 0 || spent >= limit) return null;
    const day = Math.floor((limit / spent) * elapsed);
    return day < daysInMonth(month) ? dateInMonth(month, day + 1) : null;
  };
  const totals = state.budgets.reduce(
    (acc, b) => {
      acc.limit += convert(limitOf(b), b.currency, base, settings.rates);
      acc.spent += convert(spentOf(b), b.currency, base, settings.rates);
      return acc;
    },
    { limit: 0, spent: 0 },
  );
  const unbudgeted = monthTotals(state.transactions, month, settings).expense - totals.spent;
  const budgeted = new Set(state.budgets.map((b) => b.categoryId));
  const canAdd = state.categories.some((c) => c.kind === "expense" && !budgeted.has(c.id));
  const add = () => canAdd && setTarget("new");

  return (
    <Card
      title={t("tx.budgets")}
      subtitle={state.budgets.length > 0 ? formatMonth(month) : t("tx.budgets.subtitle")}
      icon="target"
      action={<AddButton onClick={add} disabled={!canAdd} label={t("common.add")} />}
    >
      {state.budgets.length > 0 && (
        <SummaryPanel
          className="mb-3"
          value={
            totals.limit >= totals.spent
              ? t("tx.budgets.left", { amount: formatMoney(totals.limit - totals.spent, base, { compact: true }) })
              : t("tx.budgets.over", { amount: formatMoney(totals.spent - totals.limit, base, { compact: true }) })
          }
          tone={totals.spent > totals.limit ? "expense" : undefined}
          meta={formatPercent(totals.limit > 0 ? (totals.spent / totals.limit) * 100 : 0, 0)}
        >
          <ProgressMeter value={totals.spent} max={totals.limit} tone="budget" label={t("tx.budgets.all")} />
          {unbudgeted > 0.5 && (
            <p className="caption mt-2">{t("tx.budgets.outside", { amount: formatMoney(unbudgeted, base, { compact: true }) })}</p>
          )}
        </SummaryPanel>
      )}
      {state.budgets.length === 0 ? (
        <EmptyState
          icon={<Icon name="target" />}
          title={t("tx.budgets.empty")}
          hint={t("tx.budgets.empty.hint")}
          action={<AddButton onClick={add} label={t("common.add")} />}
        />
      ) : (
        <ul className="rows">
          {sortItems(state.budgets, (b) => (limitOf(b) > 0 ? spentOf(b) / limitOf(b) : 0), "desc").map((b) => {
            const cat = catById.get(b.categoryId);
            const spent = spentOf(b);
            const limit = limitOf(b);
            const over = spent > limit;
            const pct = limit > 0 ? (spent / limit) * 100 : 0;
            const carried = limit - b.limit;
            const runsOut = runsOutOn(b);
            const subs = state.categories.filter((c) => c.parentId === b.categoryId).length;
            return (
              <li key={b.categoryId}>
                <button type="button" onClick={() => setTarget(b)} className="row-tap block w-full px-2.5 py-2 text-left">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className="text-lg leading-none">
                      {cat?.icon ?? "❓"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">
                      {category(cat)}
                      {subs > 0 && <span className="font-normal text-ink-3"> · {tp("tx.budgets.withSubs", subs)}</span>}
                    </span>
                    <span className={`tnum shrink-0 text-xs ${over ? "font-semibold text-expense" : "text-ink-2"}`}>
                      {t("tx.budgets.of", {
                        spent: formatMoney(spent, b.currency, { compact: true }),
                        limit: formatMoney(limit, b.currency, { compact: true }),
                      })}
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-2.5">
                    <span className="min-w-0 flex-1">
                      <ProgressMeter value={spent} max={limit} tone="budget" label={t("tx.budgets.itemLabel", { name: category(cat) })} />
                    </span>
                    <span className={`tnum w-10 shrink-0 text-right text-xs font-semibold leading-none ${over ? "text-expense" : "text-ink-3"}`}>
                      {formatPercent(pct, 0)}
                    </span>
                  </span>
                  {(carried > 0.5 || runsOut) && (
                    <span className="mt-1 block text-xs">
                      {runsOut && (
                        <span className="text-warning">{t("tx.budgets.runsOut", { date: formatDateShort(runsOut) })}</span>
                      )}
                      {runsOut && carried > 0.5 && <span className="text-ink-3"> · </span>}
                      {carried > 0.5 && (
                        <span className="text-ink-3">
                          {t("tx.budgets.carried", { amount: formatMoney(carried, b.currency, { compact: true }) })}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {target && <BudgetSheet key={target === "new" ? "new" : target.categoryId} target={target} onClose={() => setTarget(null)} />}
    </Card>
  );
}
