import { addMonths } from "@/lib/date";
import { spentInCategory } from "@/lib/finance/finmath";
import type { AppState, Budget, Category, CategoryKind, Currency, RecurringRule } from "@/lib/types";

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

/**
 * Recurring expense rules that post exactly their category's budget every month —
 * a spending plan booked as if it had been spent, which pins the budget at 100%
 * and hides what was really spent. Only rules running in `month` count.
 */
export function plansBookedAsSpending(state: AppState, month: string): RecurringRule[] {
  return state.recurring.filter(
    (rule) =>
      rule.type === "expense" &&
      rule.startMonth <= month &&
      (!rule.endMonth || rule.endMonth >= month) &&
      state.budgets.some((b) => b.categoryId === rule.categoryId && b.currency === rule.currency && Math.abs(b.limit - rule.amount) < 1),
  );
}

const FIXED_IDS = new Set(["cat-housing", "cat-rent", "cat-utilities", "cat-internet", "cat-insurance", "cat-subs", "cat-taxes", "cat-fees"]);
const FIXED_WORDS =
  /rent|оренд|utilit|комун|internet|інтернет|phone|телефон|insur|страх|loan|кредит|mortgage|іпотек|tax|податк|subscri|підписк|miete|loyer|alquiler|czynsz|affitto|huur/i;

/**
 * Whether a category reads like a fixed bill (rent, utilities, a loan, taxes) rather
 * than spending that varies. A rule posting a bill at its budget's amount is usually
 * the real payment, not a plan — so it is not offered for stopping by default.
 */
export function looksLikeFixedPayment(category: Category | undefined): boolean {
  if (!category) return false;
  return FIXED_IDS.has(category.id) || FIXED_WORDS.test(category.name);
}
