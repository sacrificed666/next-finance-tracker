import { describe, expect, it } from "vitest";
import { DEFAULT_DASHBOARD, dashboardLayout, isDefaultDashboard, moveCard, normalizeDashboard, showCard } from "./dashboard";

describe("dashboardLayout", () => {
  it("starts from the default layout", () => {
    expect(dashboardLayout()).toEqual(DEFAULT_DASHBOARD);
    expect(isDefaultDashboard(dashboardLayout(undefined))).toBe(true);
  });

  it("keeps the saved order, drops unknown or repeated cards, and adds cards that are new", () => {
    const layout = dashboardLayout({
      main: ["spending", "quickAdd", "spending", "gone" as never],
      side: ["progress", "quickAdd"],
      hidden: ["currency", "currency", "nope" as never],
    });
    expect(layout.main).toEqual(["spending", "quickAdd", "cashFlow", "cashAhead"]);
    expect(layout.side).toEqual(["progress", "holdings", "subscriptions", "currency"]);
    expect(layout.hidden).toEqual(["currency"]);
  });
});

describe("editing", () => {
  it("moves a card within its column and stops at the ends", () => {
    const down = moveCard(DEFAULT_DASHBOARD, "quickAdd", 1);
    expect(down.main.slice(0, 2)).toEqual(["cashFlow", "quickAdd"]);
    expect(moveCard(DEFAULT_DASHBOARD, "quickAdd", -1)).toBe(DEFAULT_DASHBOARD);
    expect(moveCard(DEFAULT_DASHBOARD, "progress", 1)).toBe(DEFAULT_DASHBOARD);
    expect(moveCard(DEFAULT_DASHBOARD, "currency", -1).side).toEqual(["holdings", "currency", "subscriptions", "progress"]);
  });

  it("hides and shows a card", () => {
    const hidden = showCard(DEFAULT_DASHBOARD, "progress", false);
    expect(hidden.hidden).toEqual(["progress"]);
    expect(showCard(hidden, "progress", true).hidden).toEqual([]);
  });
});

describe("normalizeDashboard", () => {
  it("stores nothing for the default layout or for rubbish", () => {
    expect(normalizeDashboard(DEFAULT_DASHBOARD)).toBeUndefined();
    expect(normalizeDashboard("wide")).toBeUndefined();
    expect(normalizeDashboard(null)).toBeUndefined();
  });

  it("keeps a changed layout", () => {
    expect(normalizeDashboard({ ...DEFAULT_DASHBOARD, hidden: ["quickAdd"] })?.hidden).toEqual(["quickAdd"]);
  });
});
