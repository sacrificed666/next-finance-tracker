import { expect, openPage, ROUTES, test } from "./fixtures";

const STRAY_PX = 12;

for (const route of ROUTES) {
  test(`${route} has no sideways overflow and no stray scrollbars`, async ({ page, signedIn }) => {
    void signedIn;
    await openPage(page, route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page wider than the screen").toBeLessThanOrEqual(0);
    const stray = await page.evaluate((limit) => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        const cs = getComputedStyle(el);
        const y = /(auto|scroll)/.test(cs.overflowY) ? el.scrollHeight - el.clientHeight : 0;
        const x = /(auto|scroll)/.test(cs.overflowX) ? el.scrollWidth - el.clientWidth : 0;
        if ((y > 1 && y <= limit) || (x > 1 && x <= limit)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ↕${y} ↔${x}`);
      }
      return out;
    }, STRAY_PX);
    expect(stray, "blocks that scroll by a few pixels only").toEqual([]);
  });
}
