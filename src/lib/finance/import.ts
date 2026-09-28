import { addMonths, monthDiff, monthOf } from "@/lib/date";
import type { AppState, Currency, Transaction } from "@/lib/types";

/** One entry found in a bank statement, before it becomes a transaction. */
export interface ImportCandidate {
  /** Stored as the transaction's `externalId`, so importing the same statement twice adds nothing. */
  externalId: string;
  date: string;
  /** Unix seconds, when the bank gives the exact moment — used to pair the two halves of a transfer. */
  time?: number;
  type: "income" | "expense" | "transfer";
  /** Always positive; `type` carries the direction. */
  amount: number;
  currency: Currency;
  /** What the operation was in its own currency (buying dollars with a hryvnia card), when it differs. */
  opAmount?: number;
  opCurrency?: Currency;
  description: string;
  mcc?: number;
  categoryId: string;
  /** Already in the ledger — by id, or by the same day, amount and description. */
  duplicate: boolean;
  /** The app account the entry is booked to, when the statement came from a linked bank account. */
  accountId?: string;
  /** For a transfer: where the money went, and what arrived when the currency changed. */
  toAccountId?: string;
  toAmount?: number;
  /** For a transfer found as two statement lines: the other line's id. */
  pairedId?: string;
  /** A planned entry (a recurring payment, a subscription) this operation is the real version of. */
  planned?: { id: string; label: string };
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
  // Planned postings are not duplicates of the real payment: matchPlanned pairs them up instead.
  const typed = state.transactions.filter((tx) => tx.externalId || !(tx.recurringId || tx.subscriptionId));
  const loose = new Set(
    typed.map((tx) => `${tx.date}|${tx.type}|${tx.amount.toFixed(2)}|${(tx.note ?? "").toLocaleLowerCase()}`),
  );
  return candidates.map((c) => ({
    ...c,
    duplicate:
      ids.has(c.externalId) ||
      (c.pairedId !== undefined && ids.has(c.pairedId)) ||
      loose.has(`${c.date}|${c.type}|${c.amount.toFixed(2)}|${c.description.toLocaleLowerCase()}`),
  }));
}

/** How far apart the two halves of one transfer may be booked. */
const TRANSFER_WINDOW_S = 15 * 60;
const CENT = 0.005;

function sameMoney(out: ImportCandidate, into: ImportCandidate): boolean {
  if (out.currency === into.currency && Math.abs(out.amount - into.amount) < CENT) return true;
  if (out.opCurrency === into.currency && out.opAmount !== undefined && Math.abs(out.opAmount - into.amount) < CENT) return true;
  return into.opCurrency === out.currency && into.opAmount !== undefined && Math.abs(into.opAmount - out.amount) < CENT;
}

function sameMoment(a: ImportCandidate, b: ImportCandidate): boolean {
  if (a.time !== undefined && b.time !== undefined) return Math.abs(a.time - b.time) <= TRANSFER_WINDOW_S;
  return a.date === b.date;
}

/**
 * Money moved between two of your own linked accounts shows up as two statement
 * lines — out of one, into the other. Left alone they would count as spending and
 * income both; paired, they become one transfer that changes neither.
 */
export function pairTransfers(candidates: ImportCandidate[]): ImportCandidate[] {
  const partnerOf = new Map<string, ImportCandidate>();
  const taken = new Set<string>();
  for (const out of candidates) {
    if (out.type !== "expense" || !out.accountId) continue;
    const into = candidates.find(
      (c) =>
        c.type === "income" &&
        c.accountId !== undefined &&
        c.accountId !== out.accountId &&
        !taken.has(c.externalId) &&
        sameMoment(out, c) &&
        sameMoney(out, c),
    );
    if (!into) continue;
    partnerOf.set(out.externalId, into);
    taken.add(into.externalId);
  }
  return candidates.flatMap((c): ImportCandidate[] => {
    if (taken.has(c.externalId)) return [];
    const into = partnerOf.get(c.externalId);
    if (!into) return [c];
    return [
      {
        ...c,
        type: "transfer",
        categoryId: "",
        toAccountId: into.accountId,
        toAmount: into.currency === c.currency ? undefined : into.amount,
        pairedId: into.externalId,
      },
    ];
  });
}

const CASH_MCC = new Set([6010, 6011]);

/** A cash machine withdrawal is money moving to your wallet, not spending — when you track cash. */
export function cashWithdrawals(state: AppState, candidates: ImportCandidate[]): ImportCandidate[] {
  const cash = state.savings.filter((a) => a.kind === "cash");
  if (cash.length === 0) return candidates;
  return candidates.map((c) => {
    if (c.type !== "expense" || c.mcc === undefined || !CASH_MCC.has(c.mcc) || !c.accountId) return c;
    const same = cash.find((a) => a.currency === c.currency && a.id !== c.accountId);
    const foreign = cash.find((a) => a.currency === c.opCurrency && a.id !== c.accountId);
    const to = same ?? foreign;
    if (!to) return c;
    return {
      ...c,
      type: "transfer",
      categoryId: "",
      toAccountId: to.id,
      toAmount: to.currency === c.currency ? undefined : c.opAmount,
    };
  });
}

const DAY_MS = 86_400_000;
/** How far a real payment may land from the day it was planned, and how far its amount may drift. */
const PLAN_WINDOW_DAYS = 5;
const PLAN_TOLERANCE = 0.05;
const NAMED_TOLERANCE = 0.2;

/**
 * Finds the planned entry — a recurring payment or a subscription posting — that an
 * imported operation is the real version of: same direction and currency, a few days
 * from the planned date, about the same amount. A description that names the
 * subscription ("YouTube") allows a price that has since changed.
 */
export function matchPlanned(state: AppState, candidates: ImportCandidate[]): ImportCandidate[] {
  const planned = state.transactions.filter(
    (t) => (t.recurringId || t.subscriptionId) && !t.externalId && t.type !== "transfer",
  );
  if (planned.length === 0) return candidates;
  const taken = new Set<string>();
  return candidates.map((c) => {
    if (c.type === "transfer" || c.duplicate) return c;
    const text = c.description.toLocaleLowerCase();
    let best: { tx: Transaction; score: number } | null = null;
    for (const tx of planned) {
      if (taken.has(tx.id) || tx.type !== c.type || tx.currency !== c.currency) continue;
      if (tx.accountId && c.accountId && tx.accountId !== c.accountId) continue;
      const days = Math.abs(Date.parse(tx.date) - Date.parse(c.date)) / DAY_MS;
      if (days > PLAN_WINDOW_DAYS) continue;
      const named = Boolean(tx.note && tx.note.length >= 3 && text.includes(tx.note.toLocaleLowerCase()));
      const drift = Math.abs(tx.amount - c.amount) / Math.max(tx.amount, 1);
      if (drift > (named ? NAMED_TOLERANCE : PLAN_TOLERANCE)) continue;
      const score = drift * 10 + days / PLAN_WINDOW_DAYS - (named ? 1 : 0);
      if (!best || score < best.score) best = { tx, score };
    }
    if (!best) return c;
    taken.add(best.tx.id);
    const category = state.categories.find((cat) => cat.id === best.tx.categoryId);
    return {
      ...c,
      categoryId: best.tx.categoryId,
      planned: { id: best.tx.id, label: best.tx.note || category?.name || "" },
    };
  });
}

/** The transactions an accepted set of candidates becomes, booked to one account (or none). */
export function toTransactions(candidates: ImportCandidate[], accountId: string | undefined, makeId: () => string): Transaction[] {
  return candidates.map((c) => ({
    id: makeId(),
    type: c.type,
    amount: c.amount,
    currency: c.currency,
    categoryId: c.type === "transfer" ? "" : c.categoryId,
    date: c.date,
    note: c.description || undefined,
    accountId: c.accountId ?? accountId,
    toAccountId: c.type === "transfer" ? c.toAccountId : undefined,
    toAmount: c.type === "transfer" ? c.toAmount : undefined,
    externalId: c.externalId,
    bank: bankLine(c),
  }));
}

function bankLine(c: ImportCandidate): Transaction["bank"] {
  if (c.time === undefined && c.opAmount === undefined) return undefined;
  return c.opAmount !== undefined ? { time: c.time, opAmount: c.opAmount, opCurrency: c.opCurrency } : { time: c.time };
}

/**
 * The state after an import: operations that are the real version of a planned
 * entry take its place — same entry, now with the real amount and day — and the
 * rest are added. Nothing is counted twice.
 */
export function applyImport(state: AppState, picked: ImportCandidate[], makeId: () => string): AppState {
  const realOf = new Map(picked.filter((c) => c.planned).map((c) => [c.planned!.id, c]));
  const transactions = state.transactions.map((tx) => {
    const real = realOf.get(tx.id);
    if (!real) return tx;
    return {
      ...tx,
      amount: real.amount,
      date: real.date,
      externalId: real.externalId,
      bank: bankLine(real),
      accountId: tx.accountId ?? real.accountId,
      note: tx.note ?? (real.description || undefined),
    };
  });
  const added = toTransactions(picked.filter((c) => !c.planned), undefined, makeId);
  return { ...state, transactions: [...transactions, ...added] };
}

/** Everything the importers do between reading a statement and showing the preview. */
export function prepareImport(state: AppState, found: ImportCandidate[]): ImportCandidate[] {
  const shaped = cashWithdrawals(state, pairTransfers(found));
  return matchPlanned(state, markDuplicates(state, shaped)).sort((a, b) => b.date.localeCompare(a.date));
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

export interface SubscriptionSuggestion {
  /** The merchant, as the statement names it, reduced to a stable key. */
  key: string;
  name: string;
  amount: number;
  currency: Currency;
  dayOfMonth: number;
  accountId?: string;
  /** Consecutive months it was charged, ending with the latest. */
  months: number;
  /** The month after the latest charge — a subscription added from here starts then, so the charge already booked is not planned twice. */
  startMonth: string;
}

/** A merchant's name without card numbers, dates and punctuation: "NETFLIX.COM 12/09" → "netflix com". */
function merchantKey(note: string): string {
  return note
    .toLocaleLowerCase()
    .replace(/[\d*#№.,:;!?'"«»()[\]{}\-_/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

/**
 * Charges that look like a subscription nobody set up: the same merchant, one charge a
 * month for at least two months in a row, about the same amount (within 10%) and day
 * (within four days). A shop visited several times a month is not one. Merchants an
 * existing subscription already names are left out.
 */
export function suggestSubscriptions(state: AppState, today: string): SubscriptionSuggestion[] {
  const since = addMonths(monthOf(today), -6);
  const known = state.subscriptions.map((s) => s.name.toLocaleLowerCase()).filter((n) => n.length >= 3);
  const groups = new Map<string, Transaction[]>();
  for (const tx of state.transactions) {
    if (tx.type !== "expense" || tx.recurringId || tx.subscriptionId || tx.date > today || monthOf(tx.date) < since) continue;
    const note = tx.note?.trim();
    if (!note) continue;
    const key = merchantKey(note);
    if (key.length < 3) continue;
    const lower = note.toLocaleLowerCase();
    if (known.some((name) => lower.includes(name) || name.includes(key))) continue;
    const list = groups.get(key);
    if (list) list.push(tx);
    else groups.set(key, [tx]);
  }

  const out: SubscriptionSuggestion[] = [];
  for (const [key, txs] of groups) {
    const byMonth = new Map<string, Transaction>();
    for (const tx of [...txs].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(monthOf(tx.date), tx);
    const months = [...byMonth.keys()].sort();
    let run = 1;
    for (let i = months.length - 1; i > 0 && monthDiff(months[i - 1], months[i]) === 1; i--) run++;
    if (run < 2) continue;
    const recent = months.slice(-run).map((m) => byMonth.get(m)!);
    const last = recent[recent.length - 1];
    // More charges than months: a place visited often, not a bill.
    if (txs.filter((tx) => monthOf(tx.date) >= months[months.length - run]).length > run) continue;
    if (recent.some((tx) => tx.currency !== last.currency)) continue;
    if (recent.some((tx) => Math.abs(tx.amount - last.amount) > last.amount * 0.1)) continue;
    const lastDay = Number(last.date.slice(8));
    if (recent.some((tx) => Math.abs(Number(tx.date.slice(8)) - lastDay) > 4)) continue;
    out.push({
      key,
      name: last.note!.trim().slice(0, 60),
      amount: last.amount,
      currency: last.currency,
      dayOfMonth: lastDay,
      accountId: last.accountId,
      months: run,
      startMonth: addMonths(monthOf(last.date), 1),
    });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}

/** A Monobank operation as both importers see it — from a statement or from the webhook. */
export interface MonoLine {
  id: string;
  time: number;
  description: string;
  comment?: string;
  mcc: number;
  /** In the account's currency, major units; negative is money out. */
  amount: number;
  opAmount?: number;
  opCurrency?: Currency;
}

/** A Monobank operation as an import candidate, booked to the app account its card is linked to. */
export function candidateFromMono(
  state: AppState,
  line: MonoLine,
  currency: Currency,
  accountId: string | undefined,
  date: string,
): ImportCandidate {
  const type = line.amount < 0 ? "expense" : "income";
  const description = [line.description, line.comment].filter(Boolean).join(" · ");
  const foreign = line.opCurrency !== undefined && line.opCurrency !== currency;
  return {
    externalId: `mono:${line.id}`,
    date,
    time: line.time,
    type,
    amount: Math.abs(line.amount),
    currency,
    opAmount: foreign ? line.opAmount : undefined,
    opCurrency: foreign ? line.opCurrency : undefined,
    description,
    mcc: line.mcc || undefined,
    categoryId: suggestCategory(state, description, type, line.mcc || undefined),
    duplicate: false,
    accountId,
  };
}

/** A booked entry seen as the statement line it came from, so it can pair with its other half. */
function asCandidate(tx: Transaction): ImportCandidate {
  return {
    externalId: tx.externalId ?? tx.id,
    date: tx.date,
    time: tx.bank?.time,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    opAmount: tx.bank?.opAmount,
    opCurrency: tx.bank?.opCurrency,
    description: tx.note ?? "",
    categoryId: tx.categoryId,
    duplicate: false,
    accountId: tx.accountId,
  };
}

/**
 * One operation arriving on its own — the bank's webhook — folded in the way an
 * import would: already booked, it changes nothing; the second half of a transfer
 * turns the first half, booked earlier, into one transfer; a cash withdrawal becomes
 * a transfer; the real version of a planned payment fills it in; anything else is added.
 */
export function absorbOperation(state: AppState, line: ImportCandidate, makeId: () => string): AppState {
  if (state.transactions.some((tx) => tx.externalId === line.externalId)) return state;

  if (line.type !== "transfer" && line.accountId) {
    for (const tx of state.transactions) {
      if (!tx.externalId?.startsWith("mono:") || tx.recurringId || tx.subscriptionId) continue;
      if (tx.type === "transfer" || tx.type === line.type) continue;
      const other = asCandidate(tx);
      const pair = pairTransfers(line.type === "expense" ? [line, other] : [other, line]);
      if (pair.length !== 1) continue;
      const [transfer] = pair;
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === tx.id
            ? {
                ...t,
                type: "transfer" as const,
                categoryId: "",
                accountId: transfer.accountId,
                toAccountId: transfer.toAccountId,
                amount: transfer.amount,
                currency: transfer.currency,
                toAmount: transfer.toAmount,
                note: t.note ?? (line.description || undefined),
                tax: undefined,
                breakdown: undefined,
              }
            : t,
        ),
      };
    }
  }

  const [prepared] = matchPlanned(state, cashWithdrawals(state, [line]));
  return applyImport(state, [prepared], makeId);
}
