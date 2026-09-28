import { describe, expect, it } from "vitest";
import { DEFAULT_STATE } from "@/lib/constants";
import { deleteSchedule, syncSchedule } from "@/lib/state/store";
import type { AppState, SavingsAccount, Transaction } from "@/lib/types";
import {
  applyImport,
  cashWithdrawals,
  markDuplicates,
  matchPlanned,
  pairTransfers,
  prepareImport,
  suggestSubscriptions,
  type ImportCandidate,
} from "./import";

const account = (id: string, kind: SavingsAccount["kind"], currency: SavingsAccount["currency"] = "UAH"): SavingsAccount => ({
  id,
  name: id,
  icon: "💳",
  kind,
  currency,
  openingBalance: 0,
});

const state: AppState = {
  ...DEFAULT_STATE,
  savings: [account("black", "card"), account("usd", "card", "USD"), account("wallet", "cash")],
};

const line = (over: Partial<ImportCandidate>): ImportCandidate => ({
  externalId: `mono:${Math.random().toString(36).slice(2)}`,
  date: "2026-09-10",
  type: "expense",
  amount: 100,
  currency: "UAH",
  description: "",
  categoryId: "cat-other-exp",
  duplicate: false,
  ...over,
});

describe("pairTransfers", () => {
  it("turns money out of one card and into another into one transfer", () => {
    const out = line({ accountId: "black", amount: 5000, time: 1_000 });
    const into = line({ accountId: "usd", type: "income", amount: 5000, time: 1_030 });
    const [transfer, ...rest] = pairTransfers([out, into]);
    expect(rest).toHaveLength(0);
    expect(transfer).toMatchObject({ type: "transfer", accountId: "black", toAccountId: "usd", pairedId: into.externalId });
  });

  it("pairs a currency purchase through the operation amount", () => {
    const out = line({ accountId: "black", amount: 41_500, opAmount: 1000, opCurrency: "USD", time: 5_000 });
    const into = line({ accountId: "usd", type: "income", amount: 1000, currency: "USD", time: 5_010 });
    const [transfer] = pairTransfers([out, into]);
    expect(transfer).toMatchObject({ type: "transfer", amount: 41_500, currency: "UAH", toAmount: 1000 });
  });

  it("leaves lines alone when they are too far apart, on the same account, or differ in amount", () => {
    const far = pairTransfers([
      line({ accountId: "black", time: 0 }),
      line({ accountId: "usd", type: "income", time: 3_600 }),
    ]);
    expect(far.map((c) => c.type)).toEqual(["expense", "income"]);
    const same = pairTransfers([line({ accountId: "black" }), line({ accountId: "black", type: "income" })]);
    expect(same.map((c) => c.type)).toEqual(["expense", "income"]);
    const other = pairTransfers([line({ accountId: "black" }), line({ accountId: "usd", type: "income", amount: 101 })]);
    expect(other.map((c) => c.type)).toEqual(["expense", "income"]);
  });
});

describe("cashWithdrawals", () => {
  it("books a cash machine withdrawal as a transfer to the wallet", () => {
    const [c] = cashWithdrawals(state, [line({ accountId: "black", mcc: 6011, amount: 2000 })]);
    expect(c).toMatchObject({ type: "transfer", toAccountId: "wallet", categoryId: "" });
  });

  it("keeps spending that is not a withdrawal, and withdrawals when no cash account exists", () => {
    expect(cashWithdrawals(state, [line({ accountId: "black", mcc: 5411 })])[0].type).toBe("expense");
    const noCash = { ...state, savings: [account("black", "card")] };
    expect(cashWithdrawals(noCash, [line({ accountId: "black", mcc: 6011 })])[0].type).toBe("expense");
  });
});

const planned = (over: Partial<Transaction>): Transaction => ({
  id: "rec:rent:2026-09",
  type: "expense",
  amount: 14_000,
  currency: "UAH",
  categoryId: "cat-rent",
  date: "2026-09-01",
  recurringId: "rent",
  ...over,
});

describe("matchPlanned", () => {
  const withPlan = (...transactions: Transaction[]): AppState => ({ ...state, transactions });

  it("recognises the real payment of a planned entry", () => {
    const [c] = matchPlanned(withPlan(planned({})), [line({ amount: 14_000, date: "2026-09-02", accountId: "black" })]);
    expect(c.planned?.id).toBe("rec:rent:2026-09");
    expect(c.categoryId).toBe("cat-rent");
  });

  it("allows a changed price when the description names the subscription", () => {
    const sub = planned({ id: "sub:yt:2026-09", recurringId: undefined, subscriptionId: "yt", amount: 179, note: "YouTube Premium", categoryId: "cat-subs" });
    const [named] = matchPlanned(withPlan(sub), [line({ amount: 199, description: "YouTube Premium · Google", date: "2026-09-03" })]);
    expect(named.planned?.id).toBe("sub:yt:2026-09");
    const [unnamed] = matchPlanned(withPlan(sub), [line({ amount: 199, description: "Silpo", date: "2026-09-03" })]);
    expect(unnamed.planned).toBeUndefined();
  });

  it("ignores payments far from the planned day or already matched", () => {
    const [late] = matchPlanned(withPlan(planned({})), [line({ amount: 14_000, date: "2026-09-20" })]);
    expect(late.planned).toBeUndefined();
    const [imported] = matchPlanned(withPlan(planned({ externalId: "mono:old" })), [line({ amount: 14_000, date: "2026-09-01" })]);
    expect(imported.planned).toBeUndefined();
    const two = matchPlanned(withPlan(planned({})), [
      line({ amount: 14_000, date: "2026-09-01" }),
      line({ amount: 14_000, date: "2026-09-02" }),
    ]);
    expect(two.filter((c) => c.planned).length).toBe(1);
  });
});

describe("applyImport", () => {
  it("fills in the planned entry with the real payment and adds the rest", () => {
    const s = { ...state, transactions: [planned({})] };
    const rent = line({ externalId: "mono:rent", amount: 13_900, date: "2026-09-02", accountId: "black", planned: { id: "rec:rent:2026-09", label: "Rent" } });
    const coffee = line({ externalId: "mono:coffee", amount: 80, description: "Coffee", accountId: "black" });
    const out = applyImport(s, [rent, coffee], () => "new-id");
    expect(out.transactions).toHaveLength(2);
    expect(out.transactions[0]).toMatchObject({ id: "rec:rent:2026-09", amount: 13_900, date: "2026-09-02", externalId: "mono:rent", recurringId: "rent" });
    expect(out.transactions[1]).toMatchObject({ id: "new-id", note: "Coffee", externalId: "mono:coffee" });
  });

  it("recognises a transfer again after it was imported, by either of its lines", () => {
    const out = line({ accountId: "black", time: 1 });
    const into = line({ accountId: "usd", type: "income", time: 2 });
    const [transfer] = pairTransfers([out, into]);
    const after = applyImport(state, [transfer], () => "t1");
    const again = markDuplicates(after, pairTransfers([{ ...out }, { ...into }]));
    expect(again[0].duplicate).toBe(true);
  });

  it("runs the whole preparation in one call", () => {
    const s = { ...state, transactions: [planned({})] };
    const prepared = prepareImport(s, [
      line({ accountId: "black", amount: 14_000, date: "2026-09-01" }),
      line({ accountId: "black", mcc: 6011, amount: 500, date: "2026-09-05" }),
    ]);
    expect(prepared.map((c) => c.type)).toEqual(["transfer", "expense"]);
    expect(prepared[1].planned?.id).toBe("rec:rent:2026-09");
  });
});

describe("suggestSubscriptions", () => {
  const charge = (id: string, date: string, amount: number, note: string): Transaction => ({
    id,
    type: "expense",
    amount,
    currency: "UAH",
    categoryId: "cat-subs",
    date,
    note,
    accountId: "black",
  });

  it("finds a merchant charged monthly on about the same day and amount", () => {
    const s = {
      ...state,
      transactions: [
        charge("1", "2026-07-12", 349, "NETFLIX.COM 07/12"),
        charge("2", "2026-08-12", 349, "NETFLIX.COM 08/12"),
        charge("3", "2026-09-13", 379, "NETFLIX.COM 09/13"),
      ],
    };
    const [found, ...rest] = suggestSubscriptions(s, "2026-09-28");
    expect(rest).toHaveLength(0);
    expect(found).toMatchObject({ key: "netflix com", amount: 379, months: 3, dayOfMonth: 13, startMonth: "2026-10" });
  });

  it("skips shops visited often, one-off charges, drifting amounts and known subscriptions", () => {
    const s = {
      ...state,
      subscriptions: [{ id: "yt", name: "YouTube", icon: "", price: 179, currency: "UAH" as const, period: "monthly" as const, dayOfMonth: 5, startMonth: "2026-01", active: true }],
      transactions: [
        charge("a", "2026-08-02", 400, "Silpo"),
        charge("b", "2026-08-15", 900, "Silpo"),
        charge("c", "2026-09-03", 420, "Silpo"),
        charge("d", "2026-09-20", 99, "Gym"),
        charge("e", "2026-08-10", 200, "Taxi"),
        charge("f", "2026-09-10", 900, "Taxi"),
        charge("g", "2026-08-05", 179, "YouTube Premium"),
        charge("h", "2026-09-05", 179, "YouTube Premium"),
      ],
    };
    expect(suggestSubscriptions(s, "2026-09-28")).toEqual([]);
  });
});

describe("schedules keep real payments", () => {
  const rule = { id: "rent", type: "expense" as const, amount: 14_000, currency: "UAH" as const, categoryId: "cat-rent", dayOfMonth: 1, startMonth: "2026-09" };

  it("editing the rule does not overwrite an imported payment", () => {
    const s: AppState = {
      ...state,
      recurring: [{ ...rule, amount: 15_000 }],
      transactions: [planned({ amount: 13_900, externalId: "mono:rent" })],
    };
    const synced = syncSchedule(s, "recurring", "rent");
    expect(synced.transactions.find((t) => t.id === "rec:rent:2026-09")?.amount).toBe(13_900);
  });

  it("deleting the rule keeps the real payment as a plain entry", () => {
    const s: AppState = { ...state, recurring: [rule], transactions: [planned({ externalId: "mono:rent" }), planned({ id: "rec:rent:2026-10", date: "2026-10-01" })] };
    const out = deleteSchedule(s, "recurring", "rent");
    expect(out.transactions.map((t) => t.id)).toEqual(["rec:rent:2026-09"]);
    expect(out.transactions[0].recurringId).toBeUndefined();
  });
});
