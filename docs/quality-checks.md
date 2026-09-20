# 🧪 Quality checks

## ✅ The short list

```bash
npx tsc --noEmit     # types — also proves every locale has every translation key
npx eslint src       # lint
npx next build       # production build, catches server/client boundary mistakes
```

Run all three before calling a change done. The type check is the cheapest way to catch a missing
translation, a renamed field or an enum that drifted away from the database constraint.

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
> Intercept `PUT /api/state` in any browser test and answer `200` locally. The development database
> holds real data — a test must never write to it.

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
