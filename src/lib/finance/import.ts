import type { AppState, Currency, Transaction } from "@/lib/types";

/** One entry found in a bank statement, before it becomes a transaction. */
export interface ImportCandidate {
  /** Stored as the transaction's `externalId`, so importing the same statement twice adds nothing. */
  externalId: string;
  date: string;
  type: "income" | "expense";
  /** Always positive; `type` carries the direction. */
  amount: number;
  currency: Currency;
  description: string;
  mcc?: number;
  categoryId: string;
  /** Already in the ledger — by id, or by the same day, amount and description. */
  duplicate: boolean;
  /** The app account the entry is booked to, when the statement came from a linked bank account. */
  accountId?: string;
}

/**
 * Merchant category codes (the MCC a card payment carries) mapped to the
 * default categories, most specific first; the first one that exists in the
 * user's list wins.
 */
const MCC_CATEGORIES: Array<[ranges: Array<number | [number, number]>, ids: string[]]> = [
  [[5411, 5412, 5422, 5441, 5451, 5462, 5499], ["cat-groceries", "cat-food"]],
  [[5812, 5813], ["cat-restaurants", "cat-food"]],
  [[5814], ["cat-coffee", "cat-restaurants", "cat-food"]],
  [[4121], ["cat-taxi", "cat-transport"]],
  [[4111, 4112, 4131], ["cat-public-transport", "cat-transport"]],
  [[5541, 5542, 5983], ["cat-fuel", "cat-transport"]],
  [[7523], ["cat-parking", "cat-transport"]],
  [[[7531, 7549], 5533], ["cat-car", "cat-transport"]],
  [[5912, 5122], ["cat-pharmacy", "cat-health"]],
  [[[8011, 8099]], ["cat-doctors", "cat-health"]],
  [[7997, 7941, 7298], ["cat-fitness", "cat-health"]],
  [[6300], ["cat-insurance", "cat-health"]],
  [[[5611, 5699], 5137, 5139], ["cat-clothes", "cat-shopping"]],
  [[5732, 5734, 5045, 5946], ["cat-electronics", "cat-shopping"]],
  [[5977, 7230], ["cat-beauty", "cat-shopping"]],
  [[5300, 5310, 5311, 5331, 5399, 5200, 5251], ["cat-shopping"]],
  [[4814, 4816], ["cat-internet", "cat-housing"]],
  [[4899, 5815, 5816, 5817, 5818], ["cat-subs"]],
  [[4900], ["cat-utilities", "cat-housing"]],
  [[7832, 7922, 7929, 7996, 7991], ["cat-events", "cat-wants"]],
  [[5945, 5970, 5971], ["cat-hobbies", "cat-wants"]],
  [[[3000, 3299], 4511, [3500, 3999], 7011, 4722, 4411], ["cat-travel", "cat-wants"]],
  [[5942, 5994], ["cat-books", "cat-education"]],
  [[8211, 8220, 8241, 8244, 8249, 8299], ["cat-courses", "cat-education"]],
  [[5995, 742], ["cat-pets"]],
  [[8398, 8661], ["cat-charity"]],
  [[9211, 9222, 9311, 9399], ["cat-taxes"]],
];

function mccMatches(mcc: number, ranges: Array<number | [number, number]>): boolean {
  return ranges.some((r) => (Array.isArray(r) ? mcc >= r[0] && mcc <= r[1] : mcc === r));
}

/**
 * The category an imported entry most likely belongs to: the user's own rules
 * first, then the card's merchant code, then "Other".
 */
export function suggestCategory(state: AppState, description: string, type: "income" | "expense", mcc?: number): string {
  const text = description.toLocaleLowerCase();
  const exists = (id: string) => state.categories.some((c) => c.id === id && c.kind === type);
  const rule = state.rules.find((r) => r.type === type && text.includes(r.match.toLocaleLowerCase()) && exists(r.categoryId));
  if (rule) return rule.categoryId;
  if (type === "expense" && mcc !== undefined) {
    for (const [ranges, ids] of MCC_CATEGORIES) {
      if (!mccMatches(mcc, ranges)) continue;
      const hit = ids.find(exists);
      if (hit) return hit;
    }
  }
  if (type === "income" && /cashback|кешбек|кэшбэк/i.test(description) && exists("cat-cashback")) return "cat-cashback";
  const fallback = type === "expense" ? "cat-other-exp" : "cat-other-inc";
  if (exists(fallback)) return fallback;
  return state.categories.find((c) => c.kind === type && !c.parentId)?.id ?? "";
}

/** Flags candidates already in the ledger, so they start unticked in the preview. */
export function markDuplicates(state: AppState, candidates: ImportCandidate[]): ImportCandidate[] {
  const ids = new Set(state.transactions.map((tx) => tx.externalId).filter(Boolean));
  const loose = new Set(
    state.transactions.map((tx) => `${tx.date}|${tx.type}|${tx.amount.toFixed(2)}|${(tx.note ?? "").toLocaleLowerCase()}`),
  );
  return candidates.map((c) => ({
    ...c,
    duplicate:
      ids.has(c.externalId) || loose.has(`${c.date}|${c.type}|${c.amount.toFixed(2)}|${c.description.toLocaleLowerCase()}`),
  }));
}

/** The transactions an accepted set of candidates becomes, booked to one account (or none). */
export function toTransactions(candidates: ImportCandidate[], accountId: string | undefined, makeId: () => string): Transaction[] {
  return candidates.map((c) => ({
    id: makeId(),
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    categoryId: c.categoryId,
    date: c.date,
    note: c.description || undefined,
    accountId: c.accountId ?? accountId,
    externalId: c.externalId,
  }));
}

/** A short, stable fingerprint for statement rows that carry no id of their own. */
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
