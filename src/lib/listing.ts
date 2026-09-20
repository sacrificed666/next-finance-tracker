"use client";

import { useState } from "react";

export type SortDirection = "asc" | "desc";

export function sortItems<T>(
  items: readonly T[],
  key: (item: T) => number | string,
  direction: SortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * sign;
    return String(ka).localeCompare(String(kb)) * sign;
  });
}

export function matchesQuery(query: string, ...fields: Array<string | undefined | null>): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return fields.some((f) => (f ?? "").toLocaleLowerCase().includes(q));
}

const PREFIX = "finance-tracker:view:";

export function usePersistentState<T>(key: string, initial: T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      if (isValid) return isValid(parsed) ? parsed : initial;
      return typeof parsed === typeof initial ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(next));
    } catch {
      return;
    }
  };
  return [value, set] as const;
}

export function oneOf<T extends string>(values: readonly T[]) {
  return (v: unknown): v is T => typeof v === "string" && (values as readonly string[]).includes(v);
}
