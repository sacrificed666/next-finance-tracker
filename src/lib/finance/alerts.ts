import { monthOf } from "@/lib/date";
import type { I18n } from "@/lib/i18n/core";
import { setFormatLocale } from "@/lib/i18n/format";
import type { AppState, Transaction } from "@/lib/types";
import { budgetLimit, descendantsOf, spentInBudget } from "./categories";
import { formatMoney } from "./money";
import type { PushMessage } from "./reminders";

const THRESHOLDS = [100, 80];

export function operationMessage(state: AppState, tx: Transaction, i18n: I18n): PushMessage {
  setFormatLocale(i18n.intl);
  const signed = tx.type === "expense" ? -tx.amount : tx.amount;
  const account = state.savings.find((a) => a.id === tx.accountId);
  const category = i18n.category(state.categories.find((c) => c.id === tx.categoryId));
  return {
    title: [formatMoney(signed, tx.currency, { sign: true }), tx.note].filter(Boolean).join(" · "),
    body: [[category, account?.name].filter(Boolean).join(" · "), i18n.t("push.op.tap")].join("\n"),
    url: `/transactions?tx=${encodeURIComponent(tx.id)}`,
    tag: `op-${tx.id}`,
  };
}

export function budgetCrossings(before: AppState, after: AppState, tx: Transaction, i18n: I18n): PushMessage[] {
  if (tx.type !== "expense") return [];
  setFormatLocale(i18n.intl);
  const month = monthOf(tx.date);
  const out: PushMessage[] = [];
  for (const budget of after.budgets) {
    if (!descendantsOf(after.categories, budget.categoryId).has(tx.categoryId)) continue;
    const limit = budgetLimit(after, budget, month);
    if (limit <= 0) continue;
    const was = (spentInBudget(before, budget.categoryId, budget.currency, month) / limit) * 100;
    const now = (spentInBudget(after, budget.categoryId, budget.currency, month) / limit) * 100;
    const crossed = THRESHOLDS.find((t) => was < t && now >= t);
    if (crossed === undefined) continue;
    const spent = formatMoney(spentInBudget(after, budget.categoryId, budget.currency, month), budget.currency);
    const cap = formatMoney(limit, budget.currency);
    out.push({
      title: i18n.t("push.budget.title", { category: i18n.category(after.categories.find((c) => c.id === budget.categoryId)) }),
      body:
        crossed >= 100
          ? i18n.t("push.budget.over", { spent, limit: cap })
          : i18n.t("push.budget.near", { pct: String(Math.floor(now)), spent, limit: cap }),
      url: "/transactions",
      tag: `budget-${budget.categoryId}-${month}`,
    });
  }
  return out;
}
