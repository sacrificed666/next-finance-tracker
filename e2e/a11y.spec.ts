import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openPage, ROUTES, test } from "./fixtures";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function serious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.describe("accessibility", () => {
  for (const route of ROUTES) {
    test(`${route} has no serious WCAG problems`, async ({ page, signedIn }) => {
      void signedIn;
      await openPage(page, route);
      await page.waitForTimeout(1500);
      expect(await serious(page)).toEqual([]);
    });
  }

  test("the entry sheet has no serious WCAG problems", async ({ page, signedIn }) => {
    void signedIn;
    await openPage(page, "/transactions?add=expense");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(600);
    expect(await serious(page)).toEqual([]);
  });

  test("the command palette has no serious WCAG problems", async ({ page, signedIn }) => {
    void signedIn;
    await openPage(page, "/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.type("re");
    await page.waitForTimeout(400);
    expect(await serious(page)).toEqual([]);
  });

  test("the sign-in page has no serious WCAG problems", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type=email]")).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });
});
