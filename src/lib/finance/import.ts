import { addMonths, monthDiff, monthOf } from "@/lib/date";
import type { AppState, Currency, Transaction } from "@/lib/types";

export interface ImportCandidate {
  externalId: string;
  date: string;
  time?: number;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: Currency;
  opAmount?: number;
  opCurrency?: Currency;
  description: string;
  mcc?: number;
  categoryId: string;
  duplicate: boolean;
  accountId?: string;
  toAccountId?: string;
  toAmount?: number;
  pairedId?: string;
  planned?: { id: string; label: string };
}

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

export function isPlaceholder(tx: Transaction): boolean {
  return Boolean(tx.recurringId || tx.subscriptionId || tx.id.startsWith("tax:"));
}

export function markDuplicates(state: AppState, candidates: ImportCandidate[]): ImportCandidate[] {
  const ids = new Set(state.transactions.map((tx) => tx.externalId).filter(Boolean));
  const typed = state.transactions.filter((tx) => tx.externalId || !isPlaceholder(tx));
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
const PLAN_WINDOW_DAYS = 5;
const PLAN_TOLERANCE = 0.05;
const NAMED_TOLERANCE = 0.2;

export function matchPlanned(state: AppState, candidates: ImportCandidate[]): ImportCandidate[] {
  const planned = state.transactions.filter((t) => isPlaceholder(t) && !t.externalId && t.type !== "transfer");
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

export function prepareImport(state: AppState, found: ImportCandidate[]): ImportCandidate[] {
  const shaped = cashWithdrawals(state, pairTransfers(found));
  return matchPlanned(state, markDuplicates(state, shaped)).sort((a, b) => b.date.localeCompare(a.date));
}

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
  key: string;
  name: string;
  amount: number;
  currency: Currency;
  dayOfMonth: number;
  accountId?: string;
  months: number;
  startMonth: string;
}

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

export interface MonoLine {
  id: string;
  time: number;
  description: string;
  comment?: string;
  mcc: number;
  amount: number;
  opAmount?: number;
  opCurrency?: Currency;
}

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
