"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/state/store";
import type { PlannedEvent } from "@/lib/types";

const LEGACY_KEY = "finance-tracker:view:forecast.events";

export function useLegacyEvents() {
  const { update, hydrated } = useStore();
  useEffect(() => {
    if (!hydrated) return;
    let legacy: PlannedEvent[] = [];
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      legacy = raw ? (JSON.parse(raw) as PlannedEvent[]) : [];
    } catch {
      return;
    }
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    update((s) => {
      const known = new Set(s.plannedEvents.map((e) => e.id));
      return { ...s, plannedEvents: [...s.plannedEvents, ...legacy.filter((e) => !known.has(e.id))] };
    });
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {}
  }, [hydrated, update]);
}
