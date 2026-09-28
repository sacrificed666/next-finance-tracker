import { expect, openPage, test } from "./fixtures";

test("the command palette opens with Ctrl+K, filters and closes", async ({ page, signedIn, errors }) => {
  void signedIn;
  await openPage(page, "/");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.type("repo");
  await expect(dialog.getByRole("option").first()).toContainText(/Reports/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/reports$/);
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a new entry opens from the address bar and closing clears it", async ({ page, signedIn }) => {
  void signedIn;
  await openPage(page, "/transactions?add=income");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Income" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/transactions$/);
});

test("saving is attempted as a change set and never reaches the database", async ({ page, signedIn }) => {
  void signedIn;
  const saves: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/state") && request.method() === "PATCH") saves.push(request.postData() ?? "");
  });
  await openPage(page, "/settings");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("theme");
  await page.keyboard.press("Enter");
  await expect.poll(() => saves.length).toBeGreaterThan(0);
  const body = JSON.parse(saves.at(-1)!);
  expect(Object.keys(body.changes)).toEqual(["settings"]);
});
