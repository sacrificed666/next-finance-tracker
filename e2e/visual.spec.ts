import { expect, test } from "./fixtures";
import { VISUAL_NOW, visualState } from "./visual-state";

test.skip(process.platform !== "linux", "Screenshots are compared in the Playwright image only: make e2e-visual");
test.use({ timezoneId: "Europe/Kyiv", locale: "en-GB" });

const SCREENS: Array<{ path: string; name: string; themes: Array<"dark" | "light"> }> = [
  { path: "/", name: "overview", themes: ["dark", "light"] },
  { path: "/transactions", name: "expenses", themes: ["dark", "light"] },
  { path: "/reports", name: "reports", themes: ["dark"] },
  { path: "/accounts", name: "accounts", themes: ["dark"] },
  { path: "/forecast", name: "forecast", themes: ["dark"] },
  { path: "/settings", name: "settings", themes: ["dark"] },
];

for (const screen of SCREENS) {
  for (const theme of screen.themes) {
    test(`${screen.name} in the ${theme} theme looks as it did`, async ({ page, signedIn }) => {
      void signedIn;
      await page.clock.setFixedTime(new Date(VISUAL_NOW));
      await page.route("**/api/state", (route) =>
        route.request().method() === "GET"
          ? route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { ETag: '"visual"', "X-Account": "visual" },
              body: JSON.stringify(visualState(theme)),
            })
          : route.fallback(),
      );
      await page.goto(screen.path, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main h1")).toBeVisible();
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-entered"), null, { timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, { animations: "disabled", maxDiffPixels: 25 });
    });
  }
}
