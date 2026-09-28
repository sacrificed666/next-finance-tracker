import { addMonths } from "@/lib/date";
import { spentInCategory } from "@/lib/finance/finmath";
import type { AppState, Category, CategoryKind, Currency, Budget } from "@/lib/types";

/** Top-level categories of one kind, each with its direct children. */
export function categoryTree(categories: Category[], kind: CategoryKind) {
  const ofKind = categories.filter((c) => c.kind === kind);
  const ids = new Set(ofKind.map((c) => c.id));
  const parents = ofKind.filter((c) => !c.parentId || !ids.has(c.parentId));
  return parents.map((parent) => ({
    parent,
    children: ofKind.filter((c) => c.parentId === parent.id),
  }));
}

/** The category itself plus its subcategories. */
export function descendantsOf(categories: Category[], id: string): Set<string> {
  const out = new Set([id]);
  for (const c of categories) if (c.parentId === id) out.add(c.id);
  return out;
}

/** Everything spent in a budget's category and its subcategories during `month`. */
export function spentInBudget(state: AppState, categoryId: string, currency: Currency, month: string): number {
  let sum = 0;
  for (const id of descendantsOf(state.categories, categoryId)) {
    sum += spentInCategory(state.transactions, id, month, currency, state.settings);
  }
  return sum;
}

/**
 * A budget's limit for one month. With rollover on, what was left unspent the
 * month before is added — one month's worth, so an old surplus never piles up.
 */
export function budgetLimit(state: AppState, budget: Budget, month: string): number {
  if (!budget.rollover) return budget.limit;
  const unspent = budget.limit - spentInBudget(state, budget.categoryId, budget.currency, addMonths(month, -1));
  return budget.limit + Math.max(0, unspent);
}
