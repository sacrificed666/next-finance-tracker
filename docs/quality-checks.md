# 🧪 Quality checks

## ✅ The short list

```bash
npx tsc --noEmit     # types — also proves every locale has every translation key
npx eslint src e2e   # lint
npm test             # unit tests
npm run e2e          # browser tests, against the running dev stack
npx next build       # production build, catches server/client boundary mistakes
```

Run all five before calling a change done; CI runs the same on every push. The type check is the cheapest way to catch a missing
translation, a renamed field or an enum that drifted away from the database constraint.

## 🧪 Unit tests

Vitest runs `src/**/*.test.ts` in Node (`vitest.config.mts`); each test file sits next to the module
it covers and needs no database.

| File | What it pins down |
| --- | --- |
| `lib/state/changes.test.ts` | Diffing and applying change sets, merging two devices' edits, and that `normalizeState` is idempotent — the server relies on it to write only what changed |
| `lib/state/dashboard.test.ts` | The overview layout: saved order kept, unknown or repeated cards dropped, new cards added, moving and hiding, and nothing stored for the default |
| `lib/finance/import.test.ts` | Transfer pairing, cash withdrawals, planned-payment matching, duplicates, subscription suggestions, one-operation-at-a-time webhook booking, and rules learned from a correction |
| `lib/finance/plans.test.ts` | Rules that book a budget as spent, the fixed-bill heuristic and stopping schedules |
| `lib/finance/tax.test.ts` | Each year's published figures and limits, weekend deadlines, paid taxes as expenses, the income book and declaration totals |
| `lib/finance/alerts.test.ts` | The note for a bank operation, and budgets speaking up at 80% and 100% only when an operation crosses the mark, subcategories included |
| `lib/finance/export.test.ts` | The entries and report CSVs: column order, signs, base-currency amounts, quoting, and the separator and decimal mark each language's spreadsheet expects |
| `lib/finance/forecast.test.ts` | The average kept each month, and the projection adding it to the accounts, compounding it, or running them down |
| `lib/finance/month-rates.test.ts` | Which months need a rate, the month's rate in conversions, averaging the NBU's daily rates, and normalising stored rates |
| `lib/finance/payoff.test.ts` | The payoff plan: as the debts stand it matches the Debts card, an extra amount finishes sooner and cheaper, avalanche and snowball clear in their own order, cleared payments roll on, and a plan that never catches up says so |
| `lib/finance/reminders.test.ts` | What the morning notification lists and when, and how it reads in the user's language |
| `lib/device.test.ts` | Naming a device from its user agent, and the client's address from forwarded headers |
| `lib/sealing.test.ts` | Sealing and opening records, which of several keys opened one, and that a wrong key opens nothing |
| `lib/totp.test.ts` | One-time codes against the RFC 6238 vectors, clock drift, recovery-code format |
| `lib/web-push.test.ts` | Push encryption against the RFC 8291 example, VAPID signatures, the push-service allow-list, and a delivery to a local server that decrypts it |

> [!TIP]
> Pure logic in `lib/` gets a test next to it; components are covered by the browser pass below.

## 🗣️ Dictionary validation

The type system guarantees that every key exists. Two things it cannot see:

1. **Plural forms** — Ukrainian and Polish need `.few` and `.many` next to `.one` / `.other`.
2. **Placeholders** — `{amount}` in English must stay `{amount}` in every translation.

A small script comparing each dictionary against `en.ts` covers both: parse the key/value pairs, then
report missing keys, extra keys, missing plural forms, mismatched `{placeholders}` and values
identical to English. Anything it flags is either a real bug or a deliberate loanword.

> [!TIP]
> Product names ("Inzhur", "Google") and short words that genuinely match English are the only
> acceptable "same as English" results.

## 🌐 Browser tests

Playwright drives Chromium through the app at 1440 px and 390 px (`playwright.config.ts`, `e2e/`),
catching what unit tests cannot: hydration errors, raw translation keys, layout that breaks on a
phone, and the flows that tie pages together.

| File | What it checks |
| --- | --- |
| `e2e/pages.spec.ts` | Every page renders without page or console errors and shows no key from `en.ts` untranslated; a visitor without a session lands on the sign-in page, a signed-in one is sent on from it, and a session ended on every device reaches the form |
| `e2e/layout.spec.ts` | No page is wider than the screen, and no block scrolls by only a few pixels |
| `e2e/flows.spec.ts` | The command palette opens, filters and navigates; an entry opens from the address bar and closing clears it; a change is saved as a change set; an edit the server did not take survives a reload and undo drops it |
| `e2e/a11y.spec.ts` | axe finds no serious or critical WCAG 2.1 A/AA problem on any page, the entry sheet, the command palette or the sign-in page |
| `e2e/visual.spec.ts` | Six pages look as they did, pixel for pixel — the overview and Expenses in both themes, the rest in dark — at both sizes |

```bash
npm run e2e                                   # against http://localhost:3000
E2E_BASE_URL=http://localhost:3001 npm run e2e   # against another stack
E2E_USER_ID=<uuid> npm run e2e                # as a real account, read-only
```

- The session is minted from `AUTH_SECRET` (from the environment or `.env`) for an **empty test
  user**, so the suite never sees real data unless `E2E_USER_ID` asks for an account.
- Two browsers run in parallel: the dev server compiles pages on first request and falls behind with
  more.

> [!IMPORTANT]
> The fixtures answer every non-GET `/api/*` request locally, and every test goes through them. The
> development database holds real data — a test must never write to it. A check that has to write
> runs against a throwaway database restored from a backup, never against the development one.

> [!WARNING]
> Do not disable the middleware to make tests easier; the gate is part of what is being tested.

### Accessibility

`e2e/a11y.spec.ts` runs [axe](https://github.com/dequelabs/axe-core) with the WCAG 2.1 A and AA
rules and fails on anything serious or critical. Colour contrast on the glass is the one thing axe
cannot judge: over a blurred backdrop it reports "incomplete" rather than a result. That contrast is
measured instead — see [Design system](./design-system.md#-why-the-glass-is-measured-not-styled).

### Screenshots

`e2e/visual.spec.ts` compares each screen with a stored PNG in `e2e/visual.spec.ts-snapshots/` and
fails when more than 25 pixels differ. Two things keep the pictures stable:

- **The same renderer everywhere.** The screenshots run only on Linux, inside the
  `mcr.microsoft.com/playwright:v1.63.0-noble` image — CI runs its browser job in that image, and
  `make e2e-visual` builds and runs the app in it locally. On Windows or macOS `npm run e2e` skips them.
- **The same data and day.** The test answers `GET /api/state` with a fixed account
  (`e2e/visual-state.ts`: three accounts, six months of entries, rent, two subscriptions, budgets, a
  deposit, a car loan and a loan to a friend), fixes the clock at 15 September 2026, 10:00 Kyiv time,
  and waits until the entrance animations and fonts are done. The theme comes from that state, so no
  setting is ever saved.

```bash
make e2e-visual          # build in the image and compare
make e2e-visual-update   # take them again after a deliberate change, then review the PNGs in the diff
```

> [!TIP]
> When a comparison fails, `test-results/` holds the expected image, the actual one and a diff for
> each screen. A new baseline belongs in the same commit as the change that caused it.

## 🤖 Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

| Job | Steps |
| --- | --- |
| **Types, lint, unit tests, build** | `npm ci`, `tsc --noEmit`, `eslint src e2e`, `npm test`, `next build` |
| **Browser tests** | Inside the Playwright image, with a Postgres service: secrets generated for the run, the standalone production build started on port 3000, then `npx playwright test` — pages, layout, flows, accessibility and screenshots; the report, traces and server log are kept for seven days when it fails |

> [!NOTE]
> CI needs no repository secrets: `AUTH_SECRET` and `DATA_ENCRYPTION_KEY` are random for each run and
> the database starts empty.

## 🧭 Manual pass before release

- Switch the language and confirm the sign-in page, then every screen, stays stable — no layout
  jumps, no truncated buttons.
- Switch the base currency and check that tables gain or lose the right columns.
- Resize to 390 px: no horizontal scrolling anywhere, the bottom navigation stays fixed.
- Toggle light and dark themes; charts, badges and glass edges must all stay readable.
- Refresh prices with the network disabled: the app keeps the last values and shows an inline error.
