import type { AppState, Settings } from "@/lib/types";

/**
 * A save described as changes rather than as the whole state: per collection, the
 * records that were added or edited and the keys that were removed, plus the
 * settings when they moved. The browser sends only this, and the server applies it
 * to what it holds — so an edit costs one record, not the whole database, and two
 * devices editing different records never overwrite each other.
 */

type Collections = Omit<AppState, "version" | "settings">;
export type CollectionName = keyof Collections;
export type ItemOf<K extends CollectionName> = Collections[K][number];

export const COLLECTION_NAMES = [
  "transactions",
  "categories",
  "recurring",
  "subscriptions",
  "savings",
  "investments",
  "budgets",
  "debts",
  "rules",
  "receivables",
  "wishlist",
  "plannedEvents",
  "snapshots",
] as const satisfies readonly CollectionName[];

const KEYS: { [K in CollectionName]: (item: ItemOf<K>) => string } = {
  transactions: (t) => t.id,
  categories: (c) => c.id,
  recurring: (r) => r.id,
  subscriptions: (s) => s.id,
  savings: (a) => a.id,
  investments: (i) => i.id,
  budgets: (b) => b.categoryId,
  debts: (d) => d.id,
  rules: (r) => r.id,
  receivables: (r) => r.id,
  wishlist: (w) => w.id,
  plannedEvents: (e) => e.id,
  snapshots: (s) => s.date,
};

/** The key a record is stored under in its collection. */
export function keyOf<K extends CollectionName>(name: K, item: ItemOf<K>): string {
  return (KEYS[name] as (item: ItemOf<K>) => string)(item);
}

export interface CollectionChange<T> {
  upsert: T[];
  remove: string[];
}

export type StateChanges = { [K in CollectionName]?: CollectionChange<ItemOf<K>> } & {
  settings?: Settings;
};

/**
 * What changed between two states. Records are compared by identity: every update
 * in the store builds new objects for what it touches and keeps the rest, so an
 * untouched record is the very same object. A needless copy only costs an extra
 * write — the server skips records whose content did not change.
 */
export function diffState(before: AppState, after: AppState): StateChanges {
  const changes: StateChanges = {};
  for (const name of COLLECTION_NAMES) {
    const change = diffCollection(name, before[name] as ItemOf<typeof name>[], after[name] as ItemOf<typeof name>[]);
    if (change) (changes as Record<string, unknown>)[name] = change;
  }
  if (before.settings !== after.settings) changes.settings = after.settings;
  return changes;
}

function diffCollection<K extends CollectionName>(
  name: K,
  before: ItemOf<K>[],
  after: ItemOf<K>[],
): CollectionChange<ItemOf<K>> | null {
  if (before === after) return null;
  const previous = new Map(before.map((item) => [keyOf(name, item), item]));
  const seen = new Set<string>();
  const upsert: ItemOf<K>[] = [];
  for (const item of after) {
    const key = keyOf(name, item);
    seen.add(key);
    if (previous.get(key) !== item) upsert.push(item);
  }
  const remove = [...previous.keys()].filter((key) => !seen.has(key));
  return upsert.length > 0 || remove.length > 0 ? { upsert, remove } : null;
}

export function isEmptyChange(changes: StateChanges): boolean {
  return Object.keys(changes).length === 0;
}

/** How many records a change touches, for logs and tests. */
export function changeSize(changes: StateChanges): number {
  let n = changes.settings ? 1 : 0;
  for (const name of COLLECTION_NAMES) {
    const change = changes[name];
    if (change) n += change.upsert.length + change.remove.length;
  }
  return n;
}

/** What a change touches, without any content — "transactions +1 −0, settings" — for the server log. */
export function describeChanges(changes: StateChanges): string {
  const parts = COLLECTION_NAMES.flatMap((name) => {
    const change = changes[name];
    return change ? [`${name} +${change.upsert.length} −${change.remove.length}`] : [];
  });
  if (changes.settings) parts.push("settings");
  return parts.join(", ") || "nothing";
}

/** The state with the changes laid over it: edits replace in place, new records go last. */
export function applyChanges(state: AppState, changes: StateChanges): AppState {
  let next = state;
  for (const name of COLLECTION_NAMES) {
    const change = changes[name];
    if (!change) continue;
    next = { ...next, [name]: applyCollection(name, next[name] as ItemOf<typeof name>[], change as CollectionChange<ItemOf<typeof name>>) };
  }
  if (changes.settings) next = { ...next, settings: changes.settings };
  return next;
}

function applyCollection<K extends CollectionName>(
  name: K,
  items: ItemOf<K>[],
  change: CollectionChange<ItemOf<K>>,
): ItemOf<K>[] {
  const removed = new Set(change.remove);
  const incoming = new Map(change.upsert.map((item) => [keyOf(name, item), item]));
  const out: ItemOf<K>[] = [];
  for (const item of items) {
    const key = keyOf(name, item);
    if (removed.has(key) && !incoming.has(key)) continue;
    const replacement = incoming.get(key);
    if (replacement) {
      out.push(replacement);
      incoming.delete(key);
    } else {
      out.push(item);
    }
  }
  out.push(...incoming.values());
  return out;
}

/**
 * A change set as it arrives over the network, checked for shape only: known
 * collections, arrays of objects, string keys. The records themselves are
 * validated afterwards, when the merged state goes through normalizeState.
 */
export function parseChanges(raw: unknown): StateChanges | null {
  if (!isRecord(raw)) return null;
  const changes: StateChanges = {};
  for (const name of COLLECTION_NAMES) {
    const value = raw[name];
    if (value === undefined) continue;
    if (!isRecord(value) || !Array.isArray(value.upsert) || !Array.isArray(value.remove)) return null;
    if (!value.upsert.every(isRecord) || !value.remove.every((k) => typeof k === "string")) return null;
    (changes as Record<string, unknown>)[name] = { upsert: value.upsert, remove: value.remove };
  }
  if (raw.settings !== undefined) {
    if (!isRecord(raw.settings)) return null;
    changes.settings = raw.settings as unknown as Settings;
  }
  return changes;
}

/** JSON with object keys sorted, so two records with the same content always compare equal. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isRecord(v) && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
