"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_STATE, THEME_KEY } from "./constants";
import { addMonths, currentMonth, dateInMonth, monthOf } from "./date";
import { dueMonths } from "./finmath";
import { normalizeState } from "./backup";
import type { AppState, RecurringRule, Subscription, Transaction } from "./types";

/** how many months of known recurring costs are pre-posted (current + ahead) */
export const PLANNING_HORIZON_MONTHS = 12;

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * `conflict` is not just a failed write: the dataset moved on somewhere else,
 * so retrying would overwrite whatever that was. Writing stops until the tab
 * reloads.
 */
export type SyncStatus = "idle" | "saving" | "error" | "conflict";

interface StoreApi {
  state: AppState;
  /** true once the dataset has been loaded from Postgres */
  hydrated: boolean;
  /** set when the initial load failed — the app cannot reach the database */
  loadError: string | null;
  /** whether the last write reached Postgres */
  sync: SyncStatus;
  /**
   * Functional state update; persisted automatically. Pass `undoLabel` for a
   * change worth offering back ("Transaction deleted") — it snapshots the state
   * as it was and surfaces an Undo. Any later update without a label clears the
   * offer, so Undo can never reach past something else you have since done.
   */
  update: (fn: (s: AppState) => AppState, undoLabel?: string) => void;
  /** replace the whole state (import/reset) */
  replace: (next: AppState, undoLabel?: string) => void;
  /** re-read the dataset from the server */
  reload: () => Promise<void>;
  /** what the pending undo would take back, or null when there is nothing */
  undoLabel: string | null;
  /** restore the state captured before the labelled change */
  undo: () => void;
  /** drop the offer without restoring */
  dismissUndo: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

const STATE_ENDPOINT = "/api/state";

async function fetchState(): Promise<{ state: AppState; revision: string }> {
  const res = await fetch(STATE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Server responded with ${res.status}`);
  }
  // the revision this snapshot was read at; every write quotes it back
  const revision = res.headers.get("etag") ?? "";
  return { state: normalizeState(await res.json()), revision };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("idle");
  const [undoLabel, setUndoLabel] = useState<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // guards the debounced writer against firing for the state we just loaded
  const dirty = useRef(false);
  /**
   * True only once the dataset has actually come back from Postgres. Until
   * then `state` is nothing but DEFAULT_STATE, and persisting that would delete
   * every row the server holds — the sidebar and its theme switch stay live even
   * on the "database unavailable" screen, so one click used to be enough to
   * empty the database the app had just failed to read.
   */
  const loadedFromServer = useRef(false);
  // revision of the snapshot this tab is editing, refreshed after every write
  const revision = useRef("");
  // set once a write is refused as stale; cleared only by reloading
  const conflicted = useRef(false);
  // save serialization: at most one PUT is ever in flight, and it always sends
  // the newest state — overlapping writes can no longer interleave on the server
  const stateRef = useRef(state);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);
  // the state the pending undo restores; the label lives in React state so the
  // toast can render, the snapshot in a ref so writing it costs no re-render
  const undoRef = useRef<AppState | null>(null);

  // keep the latest state reachable from the async writer (updated post-render,
  // never during render, so the compiler's ref rule is satisfied)
  useEffect(() => {
    stateRef.current = state;
  });

  const load = useCallback(async () => {
    try {
      conflicted.current = false;
      const loaded = await fetchState();
      const materialized = materializeRecurring(loaded.state);
      loadedFromServer.current = true;
      revision.current = loaded.revision;
      // materializeRecurring returns the same object when nothing was due, so
      // this only schedules a write when it actually posted new rows
      dirty.current = materialized !== loaded.state;
      setState(materialized);
      setLoadError(null);
      // a fresh read is exactly what clears a conflict — this tab is current now
      setSync("idle");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not reach the database");
    } finally {
      setHydrated(true);
    }
  }, []);

  // Load once on the client. This must run in an effect, not during render or
  // a lazy useState initializer: pages are prerendered without any data, so
  // populating state during the hydrating render would desync from the
  // server-rendered skeleton and trigger a hydration mismatch.
  useEffect(() => {
    // fetching on mount is the documented escape hatch here: the data cannot be
    // read during the prerender, so it necessarily lands via setState after it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // persist to Postgres, debounced, once something actually changed. The
  // debounce coalesces rapid edits; the serialized writer below guarantees only
  // one PUT is ever in flight and it always sends the newest state, so
  // overlapping saves can never interleave and re-create rows on the server.
  useEffect(() => {
    if (!hydrated || !loadedFromServer.current || !dirty.current) return;
    // a conflicted tab holds a snapshot that is no longer the truth; writing it
    // would delete whatever the other tab saved, so it stops until a reload
    if (conflicted.current) return;
    const save = async (): Promise<void> => {
      if (savingRef.current) {
        resaveRef.current = true; // a save is running — send the latest next
        return;
      }
      savingRef.current = true;
      setSync("saving");
      try {
        const res = await fetch(STATE_ENDPOINT, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            // what this tab believes it is overwriting; the server refuses the
            // write if the dataset has moved on since
            "If-Match": revision.current,
          },
          // deliberately not `keepalive`: the fetch spec caps a keepalive body
          // at 64 KiB, and a real ledger passes that inside a year — the write
          // then failed outright rather than surviving a closing tab.
          body: JSON.stringify(stateRef.current),
        });
        if (res.status === 409) {
          conflicted.current = true;
          resaveRef.current = false;
          setSync("conflict");
          return;
        }
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        revision.current = res.headers.get("etag") ?? revision.current;
        setSync("idle");
      } catch {
        setSync("error");
        resaveRef.current = true; // retry the latest state on the next change
      } finally {
        savingRef.current = false;
        if (resaveRef.current) {
          resaveRef.current = false;
          void save();
        }
      }
    };
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void save(), 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state, hydrated]);

  /**
   * Nothing can be written after the tab is gone, so say so while it is still
   * here: a change is only ever unsaved for the debounce window plus one
   * request, and closing inside it is exactly when a figure disappears without
   * anyone noticing.
   */
  useEffect(() => {
    if (sync === "idle") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sync]);

  // apply theme preference to <html data-theme> and keep the pre-paint key in sync
  const theme = state.settings.theme;
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // unavailable storage — theme still applies below
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme, hydrated]);

  /**
   * Mark the moment a change exists but has not reached Postgres yet. Set here
   * rather than when the request starts, so the status covers the debounce
   * window too — that is where the unload guard above has to bite.
   */
  const markPending = useCallback((undoLabel: string | undefined, from: AppState) => {
    dirty.current = true;
    // nothing can be written before the dataset has been read, so claiming a
    // save is under way would leave the status stuck and the unload guard armed
    if (loadedFromServer.current && !conflicted.current) setSync("saving");
    // a labelled change offers itself back; anything else invalidates the offer,
    // so Undo can never silently roll back work done after it
    undoRef.current = undoLabel ? from : null;
    setUndoLabel(undoLabel ?? null);
  }, []);

  const update = useCallback(
    (fn: (s: AppState) => AppState, undoLabel?: string) => {
      markPending(undoLabel, stateRef.current);
      setState((s) => fn(s));
    },
    [markPending],
  );

  const replace = useCallback(
    (next: AppState, undoLabel?: string) => {
      markPending(undoLabel, stateRef.current);
      setState(materializeRecurring(normalizeState(next)));
    },
    [markPending],
  );

  const undo = useCallback(() => {
    const previous = undoRef.current;
    if (!previous) return;
    markPending(undefined, previous);
    setState(previous);
  }, [markPending]);

  const dismissUndo = useCallback(() => {
    undoRef.current = null;
    setUndoLabel(null);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        state,
        hydrated,
        loadError,
        sync,
        update,
        replace,
        reload: load,
        undoLabel,
        undo,
        dismissUndo,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreApi {
  const api = useContext(StoreContext);
  if (!api) throw new Error("useStore must be used inside <StoreProvider>");
  return api;
}

/** a recurring rule or a subscription — both post one transaction per month */
export type ScheduleKind = "recurring" | "subscription";

/**
 * Deterministic id of the transaction a schedule posts for one month, so a
 * posting exists at most once: re-running materialization, importing a backup
 * or overlapping saves all land on the same row instead of a second copy.
 */
function postingId(kind: ScheduleKind, ownerId: string, month: string): string {
  return `${kind === "recurring" ? "rec" : "sub"}:${ownerId}:${month}`;
}

/**
 * Whether `tx` was posted by the given rule or subscription. The link column
 * decides; the id prefix is checked too, because editing a posting used to
 * strip the link while keeping the id, leaving rows that belong to a schedule
 * without saying so.
 */
export function isPostingOf(tx: Transaction, kind: ScheduleKind, ownerId: string): boolean {
  const link = kind === "recurring" ? tx.recurringId : tx.subscriptionId;
  return link === ownerId || tx.id.startsWith(postingId(kind, ownerId, ""));
}

/**
 * The month a posting belongs to. The deterministic id carries it, which
 * survives a hand-edited date; only rows that predate that id (or whose date
 * was moved before it existed) fall back to reading the month off the date.
 */
function postingMonth(tx: Transaction, kind: ScheduleKind, ownerId: string): string {
  const prefix = postingId(kind, ownerId, "");
  const tail = tx.id.startsWith(prefix) ? tx.id.slice(prefix.length) : "";
  return /^\d{4}-\d{2}$/.test(tail) ? tail : monthOf(tx.date);
}

/**
 * Everything a posting derives from its rule. Kept in one place so the row a
 * schedule creates and the row it later rewrites can never drift apart.
 */
function recurringPosting(rule: RecurringRule, month: string): Omit<Transaction, "id"> {
  return {
    type: rule.type,
    amount: rule.amount,
    currency: rule.currency,
    categoryId: rule.categoryId,
    date: dateInMonth(month, rule.dayOfMonth),
    note: rule.note,
    accountId: rule.accountId,
    recurringId: rule.id,
  };
}

/** as above for a subscription; a yearly plan posts price/12 every month */
function subscriptionPosting(
  sub: Subscription,
  month: string,
  categoryId: string,
): Omit<Transaction, "id"> {
  return {
    type: "expense",
    amount: sub.period === "yearly" ? sub.price / 12 : sub.price,
    currency: sub.currency,
    categoryId,
    date: dateInMonth(month, sub.dayOfMonth),
    note: sub.name,
    accountId: sub.accountId,
    subscriptionId: sub.id,
  };
}

/** subscriptions post here; falls back to any expense category if it was deleted */
function subscriptionCategoryId(state: AppState): string | undefined {
  return (
    state.categories.find((c) => c.id === "cat-subs")?.id ??
    state.categories.find((c) => c.kind === "expense")?.id
  );
}

/**
 * Delete a recurring rule or a subscription together with every transaction it
 * posted — past, current and planned months alike. A cancelled subscription
 * should leave nothing behind in any month; use the active switch instead to
 * stop it going forward while keeping what it already charged.
 */
export function deleteSchedule(
  state: AppState,
  kind: ScheduleKind,
  id: string,
): AppState {
  return remateralizeRecurring({
    ...state,
    recurring:
      kind === "recurring" ? state.recurring.filter((r) => r.id !== id) : state.recurring,
    subscriptions:
      kind === "subscription"
        ? state.subscriptions.filter((s) => s.id !== id)
        : state.subscriptions,
    transactions: state.transactions.filter((t) => !isPostingOf(t, kind, id)),
  });
}

/* ────────────────────────────── account deletion ────────────────────────────── */

/** what still points at a savings account, so a delete can say what it touches */
export interface AccountUsage {
  /** income/expense rows recorded against it */
  entries: number;
  /** transfers with this account on either end */
  transfers: number;
  recurring: number;
  subscriptions: number;
}

export function accountUsage(state: AppState, id: string): AccountUsage {
  const usage: AccountUsage = { entries: 0, transfers: 0, recurring: 0, subscriptions: 0 };
  for (const t of state.transactions) {
    if (t.type === "transfer") {
      if (t.accountId === id || t.toAccountId === id) usage.transfers++;
    } else if (t.accountId === id) {
      usage.entries++;
    }
  }
  usage.recurring = state.recurring.filter((r) => r.accountId === id).length;
  usage.subscriptions = state.subscriptions.filter((s) => s.accountId === id).length;
  return usage;
}

/**
 * Remove an account and resolve everything that referred to it, rather than
 * leaving rows pointing at something that is gone.
 *
 * Income and expense rows keep their amount, date and category and simply stop
 * being tied to an account — they are still what happened.
 *
 * A transfer is the hard case. Left alone it reads "? → Card" forever; deleted,
 * the surviving account's balance jumps by money that genuinely did move. So it
 * becomes a plain expense (money that left the surviving account) or income
 * (money that arrived in it): once the other end is no longer tracked, that is
 * exactly what it is, and every balance stays where it was. A transfer between
 * two accounts that are both gone has no surviving side and is dropped.
 */
export function deleteAccount(state: AppState, id: string): AppState {
  const outCategory =
    state.categories.find((c) => c.id === "cat-other-exp")?.id ??
    state.categories.find((c) => c.kind === "expense")?.id;
  const inCategory =
    state.categories.find((c) => c.id === "cat-other-inc")?.id ??
    state.categories.find((c) => c.kind === "income")?.id;
  const deleted = state.savings.find((a) => a.id === id);
  const name = deleted?.name ?? "a deleted account";
  const currencyOf = new Map(state.savings.map((a) => [a.id, a.currency]));

  const transactions = state.transactions.flatMap((t): Transaction[] => {
    if (t.type !== "transfer") {
      return t.accountId === id ? [{ ...t, accountId: undefined }] : [t];
    }
    const fromGone = t.accountId === id;
    const toGone = t.toAccountId === id;
    if (!fromGone && !toGone) return [t];
    // money arrived in the surviving destination account
    if (fromGone && !toGone) {
      const destination = t.toAccountId ? currencyOf.get(t.toAccountId) : undefined;
      if (!inCategory || !destination) return [];
      return [
        {
          id: t.id,
          type: "income",
          // what actually landed, denominated in the account that received it —
          // `currency` on a transfer describes the *source* side
          amount: t.toAmount ?? t.amount,
          currency: destination,
          categoryId: inCategory,
          date: t.date,
          note: t.note ?? `Transfer from ${name}`,
          accountId: t.toAccountId,
        },
      ];
    }
    if (toGone && !fromGone) {
      if (!outCategory) return [];
      return [
        {
          id: t.id,
          type: "expense",
          amount: t.amount,
          currency: t.currency,
          categoryId: outCategory,
          date: t.date,
          note: t.note ?? `Transfer to ${name}`,
          accountId: t.accountId,
        },
      ];
    }
    return []; // both ends gone — nothing left to describe
  });

  return {
    ...state,
    savings: state.savings.filter((a) => a.id !== id),
    transactions,
    recurring: state.recurring.map((r) =>
      r.accountId === id ? { ...r, accountId: undefined } : r,
    ),
    subscriptions: state.subscriptions.map((s) =>
      s.accountId === id ? { ...s, accountId: undefined } : s,
    ),
  };
}

/**
 * Post transactions for recurring rules and active subscriptions that are
 * due, from where each left off up to the planning horizon (a year ahead) so
 * known future costs already show in future months' budgets. Append-only:
 * existing postings are never touched. Subscriptions post into the "cat-subs"
 * category (falling back to the first expense category if it was deleted);
 * yearly subscriptions post once per year, monthly ones every month.
 */
export function materializeRecurring(state: AppState): AppState {
  // through the last planned month (current + horizon - 1), so a year covers
  // exactly PLANNING_HORIZON_MONTHS months and a same-month-start yearly
  // subscription posts once, not twice at the boundary
  const horizon = addMonths(currentMonth(), PLANNING_HORIZON_MONTHS - 1);
  const newTx: Transaction[] = [];
  // ids already in the ledger — a posting is never emitted twice, not even
  // when its row lost the link back to its schedule (see `postingId`)
  const posted = new Set(state.transactions.map((t) => t.id));
  let changed = false;

  const recurring = state.recurring.map((rule) => {
    const due = dueMonths(rule, 1, horizon);
    if (due.length === 0) return rule;
    changed = true;
    for (const m of due) {
      const id = postingId("recurring", rule.id, m);
      if (posted.has(id)) continue;
      posted.add(id);
      newTx.push({ id, ...recurringPosting(rule, m) });
    }
    return { ...rule, lastAppliedMonth: due[due.length - 1] };
  });

  const subsCategoryId = subscriptionCategoryId(state);

  const subscriptions = state.subscriptions.map((sub) => {
    if (!sub.active || !subsCategoryId) return sub;
    // both cadences post every month; a yearly subscription is amortized into
    // twelve equal monthly charges (price / 12) so budgets stay smooth
    const due = dueMonths(sub, 1, horizon);
    if (due.length === 0) return sub;
    changed = true;
    for (const m of due) {
      const id = postingId("subscription", sub.id, m);
      if (posted.has(id)) continue;
      posted.add(id);
      newTx.push({ id, ...subscriptionPosting(sub, m, subsCategoryId) });
    }
    return { ...sub, lastAppliedMonth: due[due.length - 1] };
  });

  if (!changed) return state;
  return {
    ...state,
    recurring,
    subscriptions,
    transactions: [...state.transactions, ...newTx],
  };
}

/**
 * Push a rule's or subscription's current values onto **every** transaction it
 * posted — the months already posted included, not just the planned ones. An
 * edit is a correction of the standing arrangement ("rent is 21 000 now", "the
 * salary rule pays on the 5th"), so the ledger it produced has to say the same
 * thing; a row that no longer matches the rule that owns it is a row nobody can
 * explain. Months the schedule has stopped covering (its start moved later, its
 * end moved earlier) are dropped, and months it now covers but never posted are
 * filled in.
 *
 * A hand-edited posting is rewritten along with the rest: it belongs to the
 * schedule, and there is no way to tell a deliberate override from a stale row.
 * Record a one-off that should survive as its own transaction instead.
 */
export function syncSchedule(state: AppState, kind: ScheduleKind, id: string): AppState {
  const rule = kind === "recurring" ? state.recurring.find((r) => r.id === id) : undefined;
  const sub =
    kind === "subscription" ? state.subscriptions.find((s) => s.id === id) : undefined;
  const schedule: RecurringRule | Subscription | undefined = rule ?? sub;
  if (!schedule) return state;

  const horizon = addMonths(currentMonth(), PLANNING_HORIZON_MONTHS - 1);
  // the full span the schedule covers today, read without `lastAppliedMonth`
  // so it describes the arrangement rather than how far it happens to have run
  const covered = new Set(
    dueMonths(
      { startMonth: schedule.startMonth, endMonth: rule?.endMonth },
      1,
      horizon,
    ),
  );
  const subsCategoryId = subscriptionCategoryId(state);

  const transactions = state.transactions.flatMap((t) => {
    if (!isPostingOf(t, kind, id)) return [t];
    const month = postingMonth(t, kind, id);
    if (!covered.has(month)) return [];
    // rebuilt rather than merged, so a posting that was hand-edited into
    // something else (a transfer, a different category) comes back in line
    if (rule) return [{ id: t.id, ...recurringPosting(rule, month) }];
    if (!subsCategoryId) return [t];
    return [{ id: t.id, ...subscriptionPosting(sub!, month, subsCategoryId) }];
  });

  // an inactive subscription posts nothing further, so materialization leaves
  // it alone — give it the month its own history actually reaches. Everything
  // else starts from scratch, which is what fills the gaps the span opened up.
  const lastApplied = sub && !sub.active ? lastPostedMonth(transactions, kind, id) : undefined;

  return materializeRecurring({
    ...state,
    transactions,
    recurring:
      kind === "recurring"
        ? state.recurring.map((r) =>
            r.id === id ? { ...r, lastAppliedMonth: undefined } : r,
          )
        : state.recurring,
    subscriptions:
      kind === "subscription"
        ? state.subscriptions.map((s) =>
            s.id === id ? { ...s, lastAppliedMonth: lastApplied } : s,
          )
        : state.subscriptions,
  });
}

/** newest month `id` has a posting for, or undefined when it has none */
function lastPostedMonth(
  transactions: Transaction[],
  kind: ScheduleKind,
  id: string,
): string | undefined {
  const months = transactions
    .filter((t) => isPostingOf(t, kind, id))
    .map((t) => postingMonth(t, kind, id))
    .sort();
  return months.length > 0 ? months[months.length - 1] : undefined;
}

/**
 * Drop future (planned) postings and rebuild them from current rule and
 * subscription values, leaving already-posted history untouched. This is the
 * right tool when the schedule itself did not change but what it should still
 * post did — switching a subscription off keeps what it already charged and
 * clears the months ahead. For an edit to the values themselves use
 * `syncSchedule`, which carries them into the posted months too; hydration uses
 * the append-only `materializeRecurring` to avoid id churn.
 */
export function remateralizeRecurring(state: AppState): AppState {
  const cur = currentMonth();
  const kept = state.transactions.filter(
    (t) => !((t.recurringId || t.subscriptionId) && monthOf(t.date) > cur),
  );
  const lastPosted = (key: "recurringId" | "subscriptionId", id: string) => {
    const posted = kept
      .filter((t) => t[key] === id)
      .map((t) => monthOf(t.date))
      .sort();
    return posted.length > 0 ? posted[posted.length - 1] : undefined;
  };
  return materializeRecurring({
    ...state,
    transactions: kept,
    recurring: state.recurring.map((r) => ({
      ...r,
      lastAppliedMonth: lastPosted("recurringId", r.id),
    })),
    subscriptions: state.subscriptions.map((s) => ({
      ...s,
      lastAppliedMonth: lastPosted("subscriptionId", s.id),
    })),
  });
}
