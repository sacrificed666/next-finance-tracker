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
import type { AppState, Transaction } from "./types";

/** how many months of known recurring costs are pre-posted (current + ahead) */
export const PLANNING_HORIZON_MONTHS = 12;

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SyncStatus = "idle" | "saving" | "error";

interface StoreApi {
  state: AppState;
  /** true once the dataset has been loaded from Postgres */
  hydrated: boolean;
  /** set when the initial load failed — the app cannot reach the database */
  loadError: string | null;
  /** whether the last write reached Postgres */
  sync: SyncStatus;
  /** functional state update; persisted automatically */
  update: (fn: (s: AppState) => AppState) => void;
  /** replace the whole state (import/reset) */
  replace: (next: AppState) => void;
  /** re-read the dataset from the server */
  reload: () => Promise<void>;
}

const StoreContext = createContext<StoreApi | null>(null);

const STATE_ENDPOINT = "/api/state";

async function fetchState(): Promise<AppState> {
  const res = await fetch(STATE_ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Server responded with ${res.status}`);
  }
  return normalizeState(await res.json());
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>("idle");
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // guards the debounced writer against firing for the state we just loaded
  const dirty = useRef(false);
  // save serialization: at most one PUT is ever in flight, and it always sends
  // the newest state — overlapping writes can no longer interleave on the server
  const stateRef = useRef(state);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);

  // keep the latest state reachable from the async writer (updated post-render,
  // never during render, so the compiler's ref rule is satisfied)
  useEffect(() => {
    stateRef.current = state;
  });

  const load = useCallback(async () => {
    try {
      const loaded = await fetchState();
      const materialized = materializeRecurring(loaded);
      // materializeRecurring returns the same object when nothing was due, so
      // this only schedules a write when it actually posted new rows
      dirty.current = materialized !== loaded;
      setState(materialized);
      setLoadError(null);
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
    if (!hydrated || !dirty.current) return;
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stateRef.current),
          keepalive: true,
        });
        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
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

  const update = useCallback((fn: (s: AppState) => AppState) => {
    dirty.current = true;
    setState((s) => fn(s));
  }, []);

  const replace = useCallback((next: AppState) => {
    dirty.current = true;
    setState(materializeRecurring(normalizeState(next)));
  }, []);

  return (
    <StoreContext.Provider
      value={{ state, hydrated, loadError, sync, update, replace, reload: load }}
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
      newTx.push({
        id,
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        date: dateInMonth(m, rule.dayOfMonth),
        note: rule.note,
        accountId: rule.accountId,
        recurringId: rule.id,
      });
    }
    return { ...rule, lastAppliedMonth: due[due.length - 1] };
  });

  const subsCategoryId =
    state.categories.find((c) => c.id === "cat-subs")?.id ??
    state.categories.find((c) => c.kind === "expense")?.id;

  const subscriptions = state.subscriptions.map((sub) => {
    if (!sub.active || !subsCategoryId) return sub;
    // both cadences post every month; a yearly subscription is amortized into
    // twelve equal monthly charges (price / 12) so budgets stay smooth
    const due = dueMonths(sub, 1, horizon);
    if (due.length === 0) return sub;
    const perMonth = sub.period === "yearly" ? sub.price / 12 : sub.price;
    changed = true;
    for (const m of due) {
      const id = postingId("subscription", sub.id, m);
      if (posted.has(id)) continue;
      posted.add(id);
      newTx.push({
        id,
        type: "expense",
        amount: perMonth,
        currency: sub.currency,
        categoryId: subsCategoryId,
        date: dateInMonth(m, sub.dayOfMonth),
        note: sub.name,
        accountId: sub.accountId,
        subscriptionId: sub.id,
      });
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
 * Drop future (planned) postings and rebuild them from current rule and
 * subscription values, so an edit or a cancellation propagates to the months
 * ahead while already-posted history stays untouched. Use after any change to
 * a recurring rule or subscription; hydration uses the append-only
 * `materializeRecurring` instead to avoid id churn.
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
