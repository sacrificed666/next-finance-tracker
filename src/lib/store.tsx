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
import { usePathname } from "next/navigation";
import { DEFAULT_STATE, THEME_KEY } from "./constants";
import { addMonths, currentMonth, dateInMonth, monthOf } from "./date";
import { dueMonths } from "./finmath";
import { normalizeState } from "./backup";
import type { AppState, RecurringRule, Subscription, Transaction } from "./types";

export const PLANNING_HORIZON_MONTHS = 12;

export const AUTH_PATHS = new Set(["/login", "/register"]);

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SyncStatus = "idle" | "saving" | "error" | "conflict";

interface StoreApi {
  state: AppState;
  hydrated: boolean;
  loadError: string | null;
  sync: SyncStatus;
  update: (fn: (s: AppState) => AppState, undoLabel?: string) => void;
  replace: (next: AppState, undoLabel?: string) => void;
  reload: () => Promise<void>;
  undoLabel: string | null;
  undo: () => void;
  dismissUndo: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

const STATE_ENDPOINT = "/api/state";

async function fetchState(): Promise<{ state: AppState; revision: string }> {
  const res = await fetch(STATE_ENDPOINT, { cache: "no-store" });
  if (res.status === 401) {
    if (typeof window !== "undefined" && !AUTH_PATHS.has(window.location.pathname)) {
      const next = window.location.pathname;
      window.location.href = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    }
    throw new Error("Signed out.");
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? `Server responded with ${res.status}`);
  }
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
  const dirty = useRef(false);
  const loadedFromServer = useRef(false);
  const revision = useRef("");
  const conflicted = useRef(false);
  const stateRef = useRef(state);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);
  const undoRef = useRef<AppState | null>(null);

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
      dirty.current = materialized !== loaded.state;
      setState(materialized);
      setLoadError(null);
      setSync("idle");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not reach the database");
    } finally {
      setHydrated(true);
    }
  }, []);

  const pathname = usePathname();
  const onAuthRoute = AUTH_PATHS.has(pathname);

  useEffect(() => {
    if (onAuthRoute || loadedFromServer.current) return;
    void load();
  }, [load, onAuthRoute]);

  useEffect(() => {
    if (!hydrated || !loadedFromServer.current || !dirty.current) return;
    if (conflicted.current) return;
    const save = async (): Promise<void> => {
      if (savingRef.current) {
        resaveRef.current = true;
        return;
      }
      savingRef.current = true;
      setSync("saving");
      try {
        const res = await fetch(STATE_ENDPOINT, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": revision.current,
          },
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
        resaveRef.current = true;
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

  useEffect(() => {
    if (sync === "idle") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sync]);

  const theme = state.settings.theme;
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
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

  const markPending = useCallback((undoLabel: string | undefined, from: AppState) => {
    dirty.current = true;
    if (loadedFromServer.current && !conflicted.current) setSync("saving");
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

export type ScheduleKind = "recurring" | "subscription";

function postingId(kind: ScheduleKind, ownerId: string, month: string): string {
  return `${kind === "recurring" ? "rec" : "sub"}:${ownerId}:${month}`;
}

export function isPostingOf(tx: Transaction, kind: ScheduleKind, ownerId: string): boolean {
  const link = kind === "recurring" ? tx.recurringId : tx.subscriptionId;
  return link === ownerId || tx.id.startsWith(postingId(kind, ownerId, ""));
}

function postingMonth(tx: Transaction, kind: ScheduleKind, ownerId: string): string {
  const prefix = postingId(kind, ownerId, "");
  const tail = tx.id.startsWith(prefix) ? tx.id.slice(prefix.length) : "";
  return /^\d{4}-\d{2}$/.test(tail) ? tail : monthOf(tx.date);
}

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

function subscriptionCategoryId(state: AppState): string | undefined {
  return (
    state.categories.find((c) => c.id === "cat-subs")?.id ??
    state.categories.find((c) => c.kind === "expense")?.id
  );
}

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

export interface AccountUsage {
  entries: number;
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
    if (fromGone && !toGone) {
      const destination = t.toAccountId ? currencyOf.get(t.toAccountId) : undefined;
      if (!inCategory || !destination) return [];
      return [
        {
          id: t.id,
          type: "income",
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
    return [];
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

export function materializeRecurring(state: AppState): AppState {
  const horizon = addMonths(currentMonth(), PLANNING_HORIZON_MONTHS - 1);
  const newTx: Transaction[] = [];
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

export function syncSchedule(state: AppState, kind: ScheduleKind, id: string): AppState {
  const rule = kind === "recurring" ? state.recurring.find((r) => r.id === id) : undefined;
  const sub =
    kind === "subscription" ? state.subscriptions.find((s) => s.id === id) : undefined;
  const schedule: RecurringRule | Subscription | undefined = rule ?? sub;
  if (!schedule) return state;

  const horizon = addMonths(currentMonth(), PLANNING_HORIZON_MONTHS - 1);
  const covered = new Set(
    dueMonths(
      { startMonth: schedule.startMonth, endMonth: schedule.endMonth },
      1,
      horizon,
    ),
  );
  const subsCategoryId = subscriptionCategoryId(state);

  const transactions = state.transactions.flatMap((t) => {
    if (!isPostingOf(t, kind, id)) return [t];
    const month = postingMonth(t, kind, id);
    if (!covered.has(month)) return [];
    if (rule) return [{ id: t.id, ...recurringPosting(rule, month) }];
    if (!subsCategoryId) return [t];
    return [{ id: t.id, ...subscriptionPosting(sub!, month, subsCategoryId) }];
  });

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
