import type { DashboardCardId, DashboardLayout } from "@/lib/types";

export const DEFAULT_DASHBOARD: DashboardLayout = {
  main: ["quickAdd", "cashFlow", "spending", "cashAhead"],
  side: ["holdings", "subscriptions", "currency", "progress"],
  hidden: [],
};

const KNOWN = new Set<string>([...DEFAULT_DASHBOARD.main, ...DEFAULT_DASHBOARD.side]);
const isCard = (v: unknown): v is DashboardCardId => typeof v === "string" && KNOWN.has(v);

export function dashboardLayout(saved?: Partial<DashboardLayout> | null): DashboardLayout {
  const seen = new Set<DashboardCardId>();
  const take = (list: unknown) => {
    const out: DashboardCardId[] = [];
    for (const id of Array.isArray(list) ? list : []) {
      if (isCard(id) && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  };
  const main = take(saved?.main);
  const side = take(saved?.side);
  for (const id of DEFAULT_DASHBOARD.main) if (!seen.has(id)) main.push(id);
  for (const id of DEFAULT_DASHBOARD.side) if (!seen.has(id)) side.push(id);
  const hidden = [...new Set((Array.isArray(saved?.hidden) ? saved.hidden : []).filter(isCard))];
  return { main, side, hidden };
}

export function normalizeDashboard(value: unknown): DashboardLayout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const layout = dashboardLayout(value as Partial<DashboardLayout>);
  return isDefaultDashboard(layout) ? undefined : layout;
}

export function isDefaultDashboard(layout: DashboardLayout): boolean {
  const same = (a: DashboardCardId[], b: DashboardCardId[]) => a.length === b.length && a.every((id, i) => id === b[i]);
  return same(layout.main, DEFAULT_DASHBOARD.main) && same(layout.side, DEFAULT_DASHBOARD.side) && layout.hidden.length === 0;
}

export function moveCard(layout: DashboardLayout, id: DashboardCardId, step: -1 | 1): DashboardLayout {
  const column = layout.main.includes(id) ? "main" : "side";
  const list = [...layout[column]];
  const at = list.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= list.length) return layout;
  [list[at], list[to]] = [list[to], list[at]];
  return { ...layout, [column]: list };
}

export function showCard(layout: DashboardLayout, id: DashboardCardId, shown: boolean): DashboardLayout {
  const hidden = layout.hidden.filter((h) => h !== id);
  return { ...layout, hidden: shown ? hidden : [...hidden, id] };
}
