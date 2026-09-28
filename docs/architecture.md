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
                                 ├── useStore()  ──▶ GET/PUT /api/state ──▶ lib/server/repo.ts ──▶ PostgreSQL
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
- signed in and on `/login` or `/register` → redirect to `/`.

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
| Save | Debounced `PUT /api/state` with an `ETag`; the server rejects stale writes |
| Undo | `update(fn, toastMessage)` keeps the previous state for one-click undo |
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
| `GET/PUT /api/state` | The whole `AppState`; `PUT` validates, normalises and persists it |
| `POST /api/auth/register` | Owner-only registration (`OWNER_EMAIL`) |
| `GET/POST /api/auth/[...nextauth]` | Auth.js handlers (credentials + optional Google) |
| `GET/PATCH /api/profile` | Display name, avatar URL, about note |
| `POST /api/profile/password` | Set or change the password |
| `GET /api/inzhur` | Scrapes published Inzhur fund data, cached in memory for 10 minutes |
| `GET/POST/DELETE /api/monobank` | Monobank connection: the card list (never the token), connect with a token, disconnect |
| `GET /api/monobank/statement` | One card's statement for a period; `429 wait:<s>` while Monobank's one-a-minute limit applies |
| `POST /api/attachments` | Store a receipt photo (WebP, JPEG or PNG, up to 1.5 MB), sealed like every record |
| `GET /api/attachments/[id]` | Read one back, privately cached |
| `GET /api/nbu-rate` | The official NBU rate for a currency on a past date, cached in memory |

Every handler calls `auth()` first and answers `401` without a session.

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
| `lib/finance/tax-calendar.ts` | FOP deadlines per regime and year, what is still unpaid |
| `lib/finance/history.ts` | Net worth by month: stored snapshots where they exist, recomputed otherwise |
| `lib/finance/import.ts`, `csv.ts` | Statement parsing, category suggestions, duplicate detection |
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
| NBU | The official rate on a given day, for the quarterly tax summary | `app/api/nbu-rate/route.ts` (server-side) |

> [!CAUTION]
> Rate and price calls are made by the browser (except Inzhur). They are optional: the app works
> offline with the last saved numbers, and every conversion falls back to stored rates.
