import { readFileSync } from "node:fs";
import { encode } from "@auth/core/jwt";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

const COOKIE = "authjs.session-token";
const EMPTY_USER = "00000000-0000-4000-8000-00000000e2e0";

function envFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.startsWith("#"))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  } catch {
    return {};
  }
}

const secret = process.env.AUTH_SECRET ?? envFile().AUTH_SECRET;

export const ROUTES = [
  "/",
  "/calendar",
  "/reports",
  "/transactions",
  "/income",
  "/accounts",
  "/investments",
  "/forecast",
  "/profile",
  "/settings",
];

const EXTERNAL = /coingecko|monobank\.ua|bank\.gov\.ua|flagcdn|google\.com|gstatic|inzhur/;

export async function addSession(context: BrowserContext, baseURL: string, claims: Record<string, unknown> = {}) {
  if (!secret) throw new Error("AUTH_SECRET is needed to sign the test session");
  const token = await encode({
    token: { sub: process.env.E2E_USER_ID ?? EMPTY_USER, name: "E2E", ...claims },
    secret,
    salt: COOKIE,
  });
  await context.addCookies([{ name: COOKIE, value: token, url: baseURL }]);
}

export const test = base.extend<{ signedIn: void; errors: string[] }>({
  errors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR_|CORS/.test(m.text())) errors.push(m.text());
    });
    await provide(errors);
  },
  signedIn: [
    async ({ context, baseURL }, provide) => {
      await addSession(context, baseURL!);
      await provide();
    },
    { auto: false },
  ],
  context: async ({ context }, provide) => {
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (EXTERNAL.test(url.host)) return route.abort();
      if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.continue();
    });
    await provide(context);
  },
});

export async function openPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator('main [role="status"]')).toHaveCount(0);
}

export { expect };
