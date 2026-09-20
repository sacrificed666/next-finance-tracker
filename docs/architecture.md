# 🏗️ Architecture

## 🔭 The shape of it

One Next.js 16 application (App Router, React 19, React Compiler, Turbopack in dev) talks to one
PostgreSQL database. There is no separate backend: route handlers under `src/app/api` are the API,
and everything financial is computed on the client from a single JSON state object.

```text
browser ──▶ proxy.ts (session gate)
         └▶ app/layout.tsx  (locale from cookie/Accept-Language, theme, fonts)
             └▶ page.tsx ─▶ components/pages/<page>.tsx   "use client"
                             ├── useStore()  ──▶ GET/PUT /api/state ──▶ lib/repo.ts ──▶ PostgreSQL
                             ├── lib/finmath, lib/tax, lib/achievements   (pure functions)
                             └── lib/i18n    (dictionary + Intl formatting)
```

## 🚦 Routing and the session gate

`src/proxy.ts` is the middleware. It only looks for a non-empty Auth.js session cookie:

- not signed in and not on `/login` or `/register` → redirect to `/login?next=<path>`;
- signed in and on `/login` or `/register` → redirect to `/`.

Its matcher deliberately skips `api`, Next.js internals and the self-hosted logo folders:

```ts
matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|brands/|games/).*)"]
```

> [!WARNING]
> Adding a new public asset folder means adding it to that matcher, otherwise the middleware answers
> image requests with a redirect to `/login`.

## 🧠 The client store

`src/lib/store.tsx` owns all financial data in one `AppState` object.

| Concern | How it works |
| --- | --- |
| Load | `GET /api/state` on mount, except on `/login` and `/register` |
| Save | Debounced `PUT /api/state` with an `ETag`; the server rejects stale writes |
| Undo | `update(fn, toastMessage)` keeps the previous state for one-click undo |
| Derivations | Recurring rules and subscriptions are materialised into transactions after every load |

> [!NOTE]
> Pages never fetch on their own. If a page needs a number, it derives it from `state` with a pure
> function in `src/lib`, which keeps every screen consistent and makes the logic testable.

## 🗄️ API routes

| Route | Purpose |
| --- | --- |
| `GET/PUT /api/state` | The whole `AppState`; `PUT` validates, normalises and persists it |
| `POST /api/auth/register` | Owner-only registration (`OWNER_EMAIL`) |
| `GET/POST /api/auth/[...nextauth]` | Auth.js handlers (credentials + optional Google) |
| `GET/PATCH /api/profile` | Display name, avatar URL, about note |
| `POST /api/profile/password` | Set or change the password |
| `GET /api/inzhur` | Scrapes published Inzhur fund data, cached in memory for 10 minutes |

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
| `lib/finmath.ts` | Balances, net worth, investment snapshots, projections, monthly series |
| `lib/money.ts` | Conversion between currencies, formatting, parsing typed amounts |
| `lib/tax.ts` | Tax regimes, gross → net breakdowns, annual limits |
| `lib/returns.ts` | Which return type each investment kind supports |
| `lib/achievements.ts` | Facts, achievements, XP, levels, financial health |
| `lib/listing.ts` | Sorting, searching and persisted view preferences |

All of them are pure: same state in, same numbers out. Nothing there touches the network.

## 🌐 External services

| Service | Used for | Where |
| --- | --- | --- |
| Monobank, fallback NBU | UAH exchange rates | `lib/rates.ts`, called from Settings |
| CoinGecko | Cryptocurrency prices | `lib/crypto.ts`, called from Balance |
| inzhur.reit | Fund NAV and published yields | `app/api/inzhur/route.ts` (server-side) |

> [!CAUTION]
> Rate and price calls are made by the browser (except Inzhur). They are optional: the app works
> offline with the last saved numbers, and every conversion falls back to stored rates.
