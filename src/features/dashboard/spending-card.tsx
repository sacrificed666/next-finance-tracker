"use client";

import type { ReactNode } from "react";
import { CategoryBreakdown, type BreakdownSegment } from "@/components/charts";
import { Card, CardLink, EmptyState, Icon, LinkButton, ProgressMeter, SummaryPanel } from "@/components/ui";
import { budgetLimit, spentInBudget } from "@/lib/finance/categories";
import { expensesByCategory, rollupToParents } from "@/lib/finance/finmath";
import { convert, formatMoney } from "@/lib/finance/money";
import { useT } from "@/lib/i18n";
import { useMonthSummary } from "./use-month-summary";

export function SpendingCard({ className = "" }: { className?: string }) {
  const { state, settings, base, month, current, previous, hasPrevious, vsLast } = useMonthSummary();
  const { t, tp, category } = useT();

  const byCategory = rollupToParents(expensesByCategory(state.transactions, month, settings), state.categories);
  const segments: BreakdownSegment[] = [...byCategory.entries()].map(([categoryId, value]) => {
    const cat = state.categories.find((c) => c.id === categoryId);
    return { id: categoryId, label: category(cat), icon: cat?.icon ?? "❓", value, colorSlot: cat?.colorSlot ?? 3 };
  });

  const budgets = state.budgets.reduce(
    (acc, b) => {
      const spent = spentInBudget(state, b.categoryId, b.currency, month);
      const limit = budgetLimit(state, b, month);
      acc.limit += convert(limit, b.currency, base, settings.rates);
      acc.spent += convert(spent, b.currency, base, settings.rates);
      if (spent > limit) acc.over++;
      return acc;
    },
    { limit: 0, spent: 0, over: 0 },
  );

  const budgetExtra = (categoryId: string): ReactNode => {
    const budget = state.budgets.find((b) => b.categoryId === categoryId);
    if (!budget) return null;
    const spent = spentInBudget(state, categoryId, budget.currency, month);
    const limit = budgetLimit(state, budget, month);
    return (
      <div className="mt-1.5 flex items-center gap-2 pl-5">
        <span className="min-w-0 flex-1">
          <ProgressMeter
            value={spent}
            max={limit}
            tone="budget"
            label={t("tx.budgets.itemLabel", { name: category(state.categories.find((c) => c.id === categoryId)) })}
          />
        </span>
        <span className={`tnum shrink-0 text-[11px] ${spent > limit ? "font-semibold text-expense" : "text-ink-3"}`}>
          {t("dash.ofBudget", { limit: formatMoney(limit, budget.currency, { compact: true }) })}
        </span>
      </div>
    );
  };

  return (
    <Card title={t("dash.spending")} icon="spend" action={<CardLink href="/transactions" />} className={className}>
      {segments.length > 0 ? (
        <>
          <SummaryPanel
            className="mb-3"
            value={formatMoney(current.expense, base, { compact: true })}
            meta={
              <>
                {tp("common.categories", segments.length)}
                {hasPrevious && (
                  <>
                    {" · "}
                    <span className={current.expense <= previous.expense ? "text-income" : "text-expense"}>
                      {vsLast(current.expense - previous.expense)}
                    </span>
                  </>
                )}
              </>
            }
          >
            {budgets.limit > 0 && (
              <>
                <ProgressMeter value={budgets.spent} max={budgets.limit} tone="budget" label={t("tx.budgets.all")} />
                <p className="caption mt-1.5">
                  {t("tx.budgets")}:{" "}
                  <span className={budgets.spent > budgets.limit ? "text-expense" : "text-ink-2"}>
                    {budgets.limit >= budgets.spent
                      ? t("tx.budgets.left", { amount: formatMoney(budgets.limit - budgets.spent, base, { compact: true }) })
                      : t("tx.budgets.over", { amount: formatMoney(budgets.spent - budgets.limit, base, { compact: true }) })}
                  </span>
                  {" · "}
                  {t("dash.budgets.of", {
                    spent: formatMoney(budgets.spent, base, { compact: true }),
                    limit: formatMoney(budgets.limit, base, { compact: true }),
                  })}
                  {budgets.over > 0 && <span className="text-expense"> · {tp("dash.budgets.overCount", budgets.over)}</span>}
                </p>
              </>
            )}
          </SummaryPanel>
          <CategoryBreakdown segments={segments} currency={base} rowExtra={budgetExtra} twoColumn />
        </>
      ) : (
        <EmptyState
          icon={<Icon name="receipt" />}
          title={t("tx.where.empty")}
          hint={t("dash.spending.empty.hint")}
          action={<LinkButton href="/transactions">{t("dash.addExpense")}</LinkButton>}
        />
      )}
    </Card>
  );
}
