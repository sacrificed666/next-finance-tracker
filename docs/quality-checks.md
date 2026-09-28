# 🧪 Quality checks

## ✅ The short list

```bash
npx tsc --noEmit     # types — also proves every locale has every translation key
npx eslint src       # lint
npm test             # unit tests
npx next build       # production build, catches server/client boundary mistakes
```

Run all four before calling a change done. The type check is the cheapest way to catch a missing
translation, a renamed field or an enum that drifted away from the database constraint.

## 🧪 Unit tests

Vitest runs `src/**/*.test.ts` in Node (`vitest.config.mts`); each test file sits next to the module
it covers and needs no database.

| File | What it pins down |
| --- | --- |
| `lib/state/changes.test.ts` | Diffing and applying change sets, merging two devices' edits, and that `normalizeState` is idempotent — the server relies on it to write only what changed |
| `lib/finance/import.test.ts` | Transfer pairing, cash withdrawals, planned-payment matching, duplicates, subscription suggestions and one-operation-at-a-time webhook booking |
| `lib/finance/plans.test.ts` | Rules that book a budget as spent, the fixed-bill heuristic and stopping schedules |
| `lib/finance/tax.test.ts` | Each year's published figures and limits, weekend deadlines, paid taxes as expenses, the income book and declaration totals |

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

## 🌐 Browser smoke tests

A headless Chrome pass over the app catches what unit-level checks cannot: hydration errors, missing
translations rendered as raw keys and layout that breaks on small screens.

What is worth automating:

| Check | What it does |
| --- | --- |
| Page sweep | Visit every route in several locales, fail on console errors or a visible `some.key.like.this` |
| Overflow | Compare `document.scrollWidth` with the viewport at 390 px and report any element wider than the screen |
| Screenshots | Capture each page at 1440 px and 390 px for a visual diff by eye |
| Forms | Open the sheets (account, investment, subscription) and confirm the fields for each kind |

> [!IMPORTANT]
> Intercept every non-GET `/api/*` request (saves are `PATCH /api/state`) in any browser test and
> answer `200` locally. The development database holds real data — a test must never write to it.
> A test that has to write runs against a throwaway database restored from a backup.

> [!WARNING]
> Sign in through the credentials endpoint and reuse the session cookie. Do not disable the
> middleware to make tests easier; the gate is part of what you are testing.

## 🧭 Manual pass before release

- Switch the language and confirm the sign-in page, then every screen, stays stable — no layout
  jumps, no truncated buttons.
- Switch the base currency and check that tables gain or lose the right columns.
- Resize to 390 px: no horizontal scrolling anywhere, the bottom navigation stays fixed.
- Toggle light and dark themes; charts, badges and glass edges must all stay readable.
- Refresh prices with the network disabled: the app keeps the last values and shows an inline error.
