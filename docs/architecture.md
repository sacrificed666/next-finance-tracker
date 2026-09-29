# 🏗️ Architecture

## 🔭 The shape of it

One Next.js 16 application (App Router, React 19, React Compiler, Turbopack in dev) talks to one
PostgreSQL database. There is no separate backend: route handlers under `src/app/api` are the API,
and everything financial is computed on the client from a single JSON state object.

```text
browser ──▶ proxy.ts (session gate)
         └▶ app/layout.tsx  (locale from cookie/Accept-Language, theme, fonts, backdrop)
             ├▶ app/(auth)/login, register ─▶ features/auth/sign-in-page.tsx
             └▶ app/(app)/layout.tsx ─▶ components/layout/app-shell.tsx  (sidebar, tab bar, toasts)
                 └▶ page.tsx ─▶ features/<page>/<page>-page.tsx   "use client"
                                 ├── useStore()  ──▶ GET/PATCH /api/state ─▶ lib/server/repo.ts ──▶ PostgreSQL
                                 ├── lib/finance/*   (pure functions: maths, tax, achievements)
                                 └── lib/i18n        (dictionary + Intl formatting)
```

## 🗂️ Project layout

```text
src/
  app/
    layout.tsx            root: <html>, fonts, theme script, StoreProvider, LocaleBridge
    (auth)/               login, register — no app chrome
    (app)/                every signed-in page; layout.tsx wraps them in AppShell
    api/                  route handlers
  features/               one folder per page — the page composes cards, each card owns its state
    dashboard/  calendar/  reports/  transactions/  income/  accounts/  investments/  forecast/
    profile/  settings/  auth/
    shared/               bits two pages share (the live-prices footnote)
  components/
    ui/                   design-system primitives (card, button, form, choice, overlay…) + index.ts
    charts/               hand-rolled SVG charts, hero trend and split
    forms/                option picker, picker groups, tag input, receipt photos, password field, language picker
    layout/               app shell, sidebar, mobile bars, command palette, nav items, page skeleton and hero
    providers/            auto-refresh, locale bridge, net worth snapshots, service worker
  lib/
    server/               server-only: auth, db, repo, password, secrets, rate limit, profile,
                          Monobank, receipt attachments
    finance/              pure maths: finmath, money, tax, tax calendar, returns, categories, history,
                          import and CSV parsing, achievements
    market/               exchange rates, crypto prices, Inzhur quotes, hourly refresh
    catalog/              brand and game logo catalogues
    state/                client store, state normalisation/backup, list view preferences
    i18n/                 dictionaries, formatting, the server-side locale for the manifest
    constants.ts  date.ts  types.ts  password-meter.ts
  styles/                 Sass partials pulled in by app/globals.scss
  app/manifest.ts         the installable app's manifest (name, icons, shortcuts), in the visitor's language
public/sw.js              the service worker: static files cached, an offline page, never any data
public/icons/             app icons for installs (192, 512, maskable)
e2e/                      Playwright browser tests (playwright.config.ts); unit tests sit next to the code as *.test.ts
.github/workflows/ci.yml  checks and browser tests on every push
```

> [!TIP]
> A feature folder is self-contained: `<page>-page.tsx` places its cards in the shared page skeleton
> (`components/layout/page.tsx`), every card is its own file, and every add/edit sheet is its own
> file that keeps its form state and is mounted with a `key`, so opening it for another record
> always starts from a fresh form.

## 🚦 Routing and the session gate

`src/proxy.ts` is the middleware. It only looks for a non-empty Auth.js session cookie. The route
groups `(auth)` and `(app)` do not appear in URLs — they only decide which layout wraps a page:

- not signed in and not on `/login` or `/register` → redirect to `/login?next=<path>`;
- anything else passes with a fresh nonce in its `Content-Security-Policy` — see
  [Security and privacy](./security-and-privacy.md#-response-headers).

A cookie proves nothing on its own, so the `(auth)` layout calls `auth()` and sends a valid session
from `/login` or `/register` to `/`. A cookie whose session has ended — after *Sign out everywhere* or
a new `AUTH_SECRET` — fails that check, so the form renders instead of bouncing between the two pages.

Its matcher deliberately skips `api`, Next.js internals, the self-hosted logo folders and what an
install needs before sign-in (the manifest is fetched without cookies):

```ts
matcher: [
  "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|icons/|brands/|games/).*)",
]
```

`/balance` from before the split into Accounts and Investments is a permanent redirect to `/accounts`
(`next.config.ts`).

> [!WARNING]
> Adding a new public asset folder means adding it to that matcher, otherwise the middleware answers
> image requests with a redirect to `/login`.

## 🧠 The client store

`src/lib/state/store.tsx` owns all financial data in one `AppState` object.

| Concern | How it works |
| --- | --- |
| Load | `GET /api/state` on mount, except on `/login` and `/register` |
| Save | Half a second after the last edit, `PATCH /api/state` sends only what changed since the last save (`lib/state/changes.ts`): the records added or edited and the keys removed |
| Other devices | Saves of one user queue behind each other (`SELECT … FOR UPDATE` on the settings row). Changes merge on the server record by record. A save built on an older revision comes back `stale`, and the tab pulls the newer state and lays its unsent edits over it; returning to the tab checks the revision with `HEAD /api/state` and does the same |
| Undo | `update(fn, toastMessage)` keeps the previous state for one-click undo |
| Unsent edits | A save that fails keeps what it could not send in the browser's IndexedDB (`lib/state/outbox.ts`), with the account it belongs to, and retries every 5 seconds. The next load of the same account lays those changes over the server's state and says so in a toast whose **Undo** drops them. A successful save or signing out clears the store |
| Background writes | `quietUpdate(fn)` saves without touching the undo slot — the daily net worth snapshot uses it |
| Save status | `useSyncStatus()` — `sync` and the pending undo live in their own context, so a save or a toast closing re-renders only the sync dot and the toast, not every card |
| Derivations | Recurring rules and subscriptions are materialised into transactions after every load |

> [!NOTE]
> Pages never fetch on their own. If a page needs a number, it derives it from `state` with a pure
> function in `src/lib/finance`, which keeps every screen consistent and makes the logic testable.

### Sheets opened from the address bar

`features/transactions/entry-intents.tsx` sits beside the app shell and opens the entry sheet on any
page when the URL asks for it: `?add=expense`, `?add=income` or `?add=transfer` for a new entry, and
`?tx=<id>` to edit one. Closing the sheet removes the parameter. The install shortcuts and the command
palette (`components/layout/command-palette.tsx`, Ctrl + K) both use it, so neither has to mount a
sheet of its own.

## 🗄️ API routes

| Route | Purpose |
| --- | --- |
| `GET /api/state` | The whole `AppState`, with its revision as the `ETag` |
| `PATCH /api/state` | `{ base, changes }`: merges the changes into the stored state, normalises the result and writes only the records whose content changed |
| `HEAD /api/state` | The revision alone, for the "did another device save?" check |
| `POST /api/auth/register` | Owner-only registration (`OWNER_EMAIL`) |
| `GET/POST /api/auth/[...nextauth]` | Auth.js handlers (credentials + optional Google) |
| `GET/PATCH /api/profile` | Display name, avatar URL, about note |
| `POST /api/profile/password` | Set or change the password |
| `POST /api/profile/two-factor` | `{ action, code }`: `begin` returns a new secret and its `otpauth://` address, `confirm` turns two-step verification on and returns the recovery codes, `disable` turns it off |
| `DELETE /api/profile/sessions` | Ends every session of the account by raising its session epoch |
| `GET/PUT/DELETE /api/push` | The key devices subscribe with and the hour notes go out; save or forget this device |
| `POST /api/push/test` | Send a test notification to this device |
| `POST /api/push/remind` | Send the day's notes; called every 15 minutes by the server's own timer, with a token instead of a session |
| `GET /api/inzhur` | Scrapes published Inzhur fund data, cached in memory for 10 minutes |
| `GET/POST/DELETE /api/monobank` | Monobank connection: the card list (never the token), connect with a token, disconnect |
| `GET /api/monobank/statement` | One card's statement for a period; `429 wait:<s>` while Monobank's one-a-minute limit applies |
| `POST /api/monobank/webhook` | Turn automatic import on or off (`{ on }`); needs `AUTH_URL` to be https |
| `GET/POST /api/monobank/webhook/[key]` | Where Monobank sends new operations; the secret key identifies the user, no session |
| `POST /api/attachments` | Store a receipt photo (WebP, JPEG or PNG, up to 1.5 MB), sealed like every record |
| `GET /api/attachments/[id]` | Read one back, privately cached |
| `GET /api/nbu-rate` | The official NBU rate for a currency on a past date, or with `?month=` the month's average for USD and EUR; cached in memory |

Every handler calls `auth()` first and answers `401` without a session — except the Monobank webhook
receiver, which Monobank calls without one and which is identified by the secret in its address, and
the notification sender, which the server's own timer calls with a token derived from `AUTH_SECRET`.

## 🖥️ Rendering model

- The root layout is `async`: it reads the `ft-locale` cookie and `Accept-Language`, so pages render
  server-side already in the right language. That makes routes dynamic by design.
- Page components are client components — they need the store, live prices and browser storage for
  view preferences.
- `LocaleBridge` reconciles the cookie locale with the stored `settings.locale` once the state
  arrives, so the language follows the account across devices.

## 🧮 Where the maths lives

| Module | Responsibility |
| --- | --- |
| `lib/finance/finmath.ts` | Balances, net worth, investment snapshots, projections, monthly series |
| `lib/finance/money.ts` | Conversion between currencies, formatting, parsing typed amounts |
| `lib/finance/tax.ts` | Tax regimes, gross → net breakdowns, annual limits |
| `lib/finance/returns.ts` | Which return type each investment kind supports |
| `lib/finance/categories.ts` | Category tree, subcategories, spending against a budget, rollover limits |
| `lib/finance/tax.ts` | Regimes and their figures for any year (`TAX_YEARS`), tax breakdowns, annual headroom |
| `lib/finance/tax-calendar.ts` | FOP deadlines per regime and year, paid taxes as expenses, the income book, declaration totals |
| `lib/finance/history.ts` | Net worth by month: stored snapshots where they exist, recomputed otherwise |
| `lib/finance/import.ts`, `csv.ts` | Statement parsing, category suggestions, duplicates, transfer pairing, planned-payment matching, subscription suggestions |
| `lib/state/changes.ts` | Change sets between two states: diff, apply, parse, the stable comparison the server writes by |
| `lib/finance/achievements.ts` | Facts, achievements, XP, levels, financial health |
| `lib/state/listing.ts` | Sorting, searching and persisted view preferences |

All of them are pure: same state in, same numbers out. Nothing there touches the network.

## 🌐 External services

| Service | Used for | Where |
| --- | --- | --- |
| Monobank, fallback NBU | UAH exchange rates | `lib/market/rates.ts`, refreshed hourly |
| CoinGecko | Cryptocurrency prices | `lib/market/crypto.ts`, refreshed hourly |
| inzhur.reit | Fund NAV and published yields | `app/api/inzhur/route.ts` (server-side) |
| Monobank personal API | Card list and statements, with your token | `lib/server/monobank.ts` (server-side) |
| NBU | The official rate on a given day, for the quarterly tax summary, and each ended month's average, for past income and spending | `app/api/nbu-rate/route.ts` (server-side) |

> [!CAUTION]
> Rate and price calls are made by the browser (except Inzhur). They are optional: the app works
> offline with the last saved numbers, and every conversion falls back to stored rates.
