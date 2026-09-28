import { describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "@/lib/constants";
import type { AppState, Transaction } from "@/lib/types";
import { normalizeState } from "./backup";
import { applyChanges, changeSize, diffState, isEmptyChange, parseChanges, stableJson } from "./changes";

const tx = (id: string, amount = 100, date = "2026-09-01"): Transaction => ({
  id,
  type: "expense",
  amount,
  currency: "UAH",
  categoryId: "cat-food",
  date,
});

const withTx = (...transactions: Transaction[]): AppState => ({ ...DEFAULT_STATE, transactions });

describe("diffState", () => {
  it("finds nothing between a state and itself", () => {
    const s = withTx(tx("a"), tx("b"));
    expect(isEmptyChange(diffState(s, s))).toBe(true);
  });

  it("sends only the record that was edited, added or removed", () => {
    const a = tx("a");
    const b = tx("b");
    const before = withTx(a, b);
    const after = { ...before, transactions: [a, { ...b, amount: 250 }, tx("c")] };
    const changes = diffState(before, after);
    expect(changes.transactions?.upsert.map((t) => t.id)).toEqual(["b", "c"]);
    expect(changes.transactions?.remove).toEqual([]);
    expect(changes.categories).toBeUndefined();

    const removed = diffState(before, { ...before, transactions: [a] });
    expect(removed.transactions).toEqual({ upsert: [], remove: ["b"] });
  });

  it("keys budgets by category and snapshots by date", () => {
    const before: AppState = { ...DEFAULT_STATE, budgets: [{ categoryId: "cat-food", limit: 100, currency: "UAH" }] };
    const after: AppState = { ...before, budgets: [{ categoryId: "cat-food", limit: 200, currency: "UAH" }] };
    expect(diffState(before, after).budgets?.upsert[0].limit).toBe(200);
  });

  it("notices settings only when they were replaced", () => {
    const s = withTx();
    expect(diffState(s, { ...s, settings: { ...s.settings, theme: "light" } }).settings?.theme).toBe("light");
    expect(diffState(s, { ...s, transactions: [tx("a")] }).settings).toBeUndefined();
  });
});

describe("applyChanges", () => {
  it("replays a diff to reach the same state", () => {
    const before = withTx(tx("a"), tx("b"), tx("c"));
    const after = { ...before, transactions: [tx("a", 5), before.transactions[2], tx("d")] };
    const rebuilt = applyChanges(before, diffState(before, after));
    expect(stableJson(rebuilt.transactions)).toBe(stableJson(after.transactions));
  });

  it("merges edits from two devices that touched different records", () => {
    const server = withTx(tx("a"), tx("b"));
    const mine = diffState(server, { ...server, transactions: [tx("a", 1), server.transactions[1]] });
    const theirs = diffState(server, { ...server, transactions: [server.transactions[0], tx("b", 2)] });
    const merged = applyChanges(applyChanges(server, theirs), mine);
    expect(merged.transactions.map((t) => t.amount)).toEqual([1, 2]);
  });

  it("keeps an upsert that arrives together with a removal of the same key", () => {
    const s = withTx(tx("a"));
    const out = applyChanges(s, { transactions: { upsert: [tx("a", 9)], remove: ["a"] } });
    expect(out.transactions.map((t) => t.amount)).toEqual([9]);
  });

  it("counts what a change touches", () => {
    expect(changeSize({ transactions: { upsert: [tx("a")], remove: ["b", "c"] }, settings: DEFAULT_STATE.settings })).toBe(4);
  });
});

describe("parseChanges", () => {
  it("accepts a well-formed change set and ignores unknown collections", () => {
    const parsed = parseChanges({ transactions: { upsert: [tx("a")], remove: ["b"] }, nonsense: 1 });
    expect(parsed?.transactions?.remove).toEqual(["b"]);
  });

  it("rejects the wrong shapes", () => {
    expect(parseChanges(null)).toBeNull();
    expect(parseChanges({ transactions: [] })).toBeNull();
    expect(parseChanges({ transactions: { upsert: [1], remove: [] } })).toBeNull();
    expect(parseChanges({ transactions: { upsert: [], remove: [1] } })).toBeNull();
    expect(parseChanges({ settings: "dark" })).toBeNull();
  });
});

describe("stableJson", () => {
  it("ignores key order and missing-versus-undefined fields", () => {
    expect(stableJson({ a: 1, b: { c: 2, d: 3 } })).toBe(stableJson({ b: { d: 3, c: 2 }, a: 1 }));
    expect(stableJson({ a: 1, note: undefined })).toBe(stableJson({ a: 1 }));
  });
});

describe("normalizeState", () => {
  // The server compares records before and after a save to write only what changed;
  // that only works if normalising twice gives the same result as normalising once.
  it("is idempotent, so an unchanged record never looks changed", () => {
    const raw = {
      ...DEFAULT_STATE,
      transactions: [tx("a"), { ...tx("b"), tags: ["Trip", "trip", "#work"], note: "  coffee  " }],
      budgets: [{ categoryId: "cat-food", limit: 5000, currency: "UAH", rollover: true }],
      snapshots: [{ date: "2026-09-01", total: 1, savings: 1, investments: 0, debts: 0, receivables: 0, rates: { USD: 41, EUR: 45 } }],
    };
    const once = normalizeState(raw);
    const twice = normalizeState(once);
    expect(stableJson(twice)).toBe(stableJson(once));
  });
});
