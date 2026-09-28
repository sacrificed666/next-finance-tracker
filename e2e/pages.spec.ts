import { readFileSync } from "node:fs";
import { expect, openPage, ROUTES, test } from "./fixtures";

const KEYS = new Set(
  [...readFileSync("src/lib/i18n/dict/en.ts", "utf8").matchAll(/^\s*"([a-zA-Z0-9_.]+)":/gm)].map((m) => m[1].replace(/\.(one|other)$/, "")),
);

test.describe("every page", () => {
  for (const route of ROUTES) {
    test(`${route} renders without errors or raw translation keys`, async ({ page, signedIn, errors }) => {
      void signedIn;
      await openPage(page, route);
      const text = await page.locator("body").innerText();
      const raw = [...text.matchAll(/\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+\b/g)].map((m) => m[0]).filter((word) => KEYS.has(word));
      expect(raw, "untranslated keys on the page").toEqual([]);
      expect(errors, "page and console errors").toEqual([]);
    });
  }
});

test("a visitor without a session is sent to the sign-in page", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login\?next=%2Ftransactions/);
  await expect(page.locator("input[type=email], input[name=email]").first()).toBeVisible();
});
