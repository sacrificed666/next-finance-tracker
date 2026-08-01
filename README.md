# 💰 Finance Tracker

A self-hosted personal finance dashboard for people who keep their money in more
than one currency. Track income, spending, subscriptions and investments across
**₴ / $ / €**, watch your net worth build up, and project it years ahead.

Built with Next.js 16 and PostgreSQL, packaged with Docker for three
environments. Your data lives in your own database — nothing is sent anywhere.

---

## ✨ What it does

### 📊 Dashboard
One screen for everything: net worth shown in all three currencies at once,
this month's income / expenses / net flow / savings rate, a 12-month cash-flow
chart, spending by category with budget meters, net-worth composition, currency
allocation, a 5-year outlook and a quick-add form.

### 💸 Expenses
A month-by-month ledger with recurring payments, subscriptions and budgets.

- **Known future costs are posted a year ahead** — recurring rules and
  subscriptions fill the next 12 months, so a future month already shows what it
  will cost. Those rows are marked `PLANNED`.
- **Subscriptions can be monthly or yearly.** A yearly plan is amortized into
  twelve equal monthly charges, so one big annual bill never distorts a single
  month's budget.
- **Budgets** per category with progress meters that warn as you approach the
  limit and turn red past it. Only spending counts toward a limit — a refund
  filed under the same category gives the budget room back.
- **Search the ledger** by note, category, account, amount or currency, filtered
  to money in, money out or transfers. Searching stays inside the month you are
  reading until you ask it to span every month.

### 🧾 Income
Every kind of income in one list — salary, freelance, interest, dividends,
sales, gifts.

- **Simple amount** by default: category, amount, currency, note.
- **Lands in an account**, so income moves a real balance instead of only
  showing up in a report.
- **Day-rate calculator** for contract work: `days × rate + premium +
  compensations − cut-offs`.
- **ФОП tax toggle**: take-home = `gross × (1 − rate) − fixed ₴`, with the fixed
  part converted into the income currency. Rate and fixed deduction are
  configurable in Settings.

### 🏦 Balance
Accounts and investments as one balance sheet, every row in ₴ / $ / € at once.

- **Balances are derived, never typed over.** An account has an *opening
  balance*; every transaction assigned to it moves the balance from there.
- **Transfers** between your own accounts, including cross-currency (₴ → €),
  where the amount that actually arrived pins the real rate of that day.
  Transfers are excluded from income and expense totals.
- **Reconciliation**: enter the balance your bank shows and the difference is
  booked as a transaction, so every change keeps a paper trail.
- **Investments** with compound interest (reinvested at a chosen frequency) or
  simple interest (paid out), optional monthly top-ups, and a one-year forecast
  per position. Give a position a **maturity** and it stops earning on that
  date — a two-year deposit no longer compounds its way through the forecast.
- **Deleting an account resolves what pointed at it** instead of leaving
  orphans: entries keep their amount and lose only the account, and a transfer
  becomes plain income or spending on the account that survives, so no balance
  moves behind your back.

### 🔮 Forecast
Project savings + investments 1–30 years ahead, with a monthly-saving input
prefilled from your real 3-month average, plus a year-by-year table.

### ⚙️ Settings
Base currency, theme, ФОП tax parameters, categories, and **live exchange
rates** from Monobank (buy rate, matching what you actually get when selling
currency) with the official NBU rate as a fallback. Full JSON export / import
and a reset.

---

## 🚀 Quick start

Requires **Docker** and **Docker Compose v2**. Nothing else — Node and Postgres
run in containers.

```bash
git clone <this-repo> && cd next-finance-tracker
make dev-up
```

That creates `.env` from `.env.example` if missing, builds the image, starts
Postgres and the app, and applies the schema. Open **http://localhost:3000**.

```bash
make help     # every available command, grouped by environment
make check    # verify docker, compose and .env are in place
```

> Running without Docker? `npm install && npm run dev` works too, but you must
> point `DATABASE_URL` at a reachable PostgreSQL instance yourself.

---

## 🐳 Environments

The root `docker-compose.yml` holds everything the environments share (the app,
Postgres, network, volume, healthchecks). Each environment layers one overlay
from `docker/` on top:

| | 🛠️ Development | 🧪 Staging | 🚀 Production |
|---|---|---|---|
| Overlay | `docker/development.yml` | `docker/staging.yml` | `docker/production.yml` |
| Image stage | `dev` (hot reload) | `runner` (built) | `runner` (built) |
| Source | bind-mounted | baked into the image | baked into the image |
| App port | `3000` | `3001` | `3000` |
| Postgres port | published | loopback only | **not published** |
| Restart | no | `unless-stopped` | `always` |
| Extras | polling file watch | resource limits, log rotation | limits, log rotation, `no-new-privileges`, tmpfs |

They use separate compose project names (`finance-dev`, `finance-stage`,
`finance-prod`), so environments can run side by side.

### Commands

Every environment has the same verbs — swap the `dev-` prefix for `stage-` or
`prod-`:

```bash
make dev-up          # 🚀 build and start (detached)
make dev-down        # 🛑 stop, keep data
make dev-logs        # 📜 follow logs
make dev-ps          # 📋 container status
make dev-shell       # 🐚 shell inside the app container
make dev-psql        # 🐘 psql inside the database
make dev-migrate     # 🧬 apply db/schema.sql
make dev-db-backup   # 💾 dump into ./backups
make dev-db-restore FILE=backups/dev-….sql
make dev-destroy     # 💣 stop and delete the database volume
make dev-deploy      # 📦 build → up → migrate
```

`make prod-deploy` additionally takes a backup before building, and
`make prod-destroy` asks for typed confirmation before removing the volume.

---

## 🔐 Configuration

`make env` copies `.env.example` to `.env` (never overwriting an existing one).

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | environment label passed to the app |
| `APP_PORT` | per overlay | host port the app is published on |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `finance` / … | database credentials |
| `POSTGRES_PORT` | `5432` | host port for Postgres (dev/staging only) |
| `DATABASE_URL` | assembled | set explicitly to use a managed/external database |
| `DATABASE_POOL_MAX` | `10` | max connections in the app's pool |
| `IMAGE_NAME` / `IMAGE_TAG` | `finance-tracker` / `latest` | image naming for staging and production |

⚠️ Change `POSTGRES_PASSWORD` before staging or production.

---

## 🏗️ How it is built

```
src/
  app/                 routes (thin server wrappers exporting metadata)
    api/state/         GET + PUT — the whole dataset
  components/
    pages/             one client component per route
    ui.tsx             buttons, sheets, fields, money display
    charts.tsx         hand-rolled SVG charts (no chart library)
    nav.tsx  shell.tsx app chrome
  lib/
    types.ts           the domain model
    finmath.ts         all money maths — interest, tax, balances, projections
    repo.ts            AppState ⇄ PostgreSQL
    db.ts              connection pool, schema bootstrap
    store.tsx          client store, loads and saves through the API
    backup.ts          validation, normalization and data migrations
    money.ts date.ts   formatting and conversion helpers
    rates.ts           Monobank / NBU exchange rates
db/schema.sql          idempotent schema — safe to run on every deploy
docker/                per-environment compose overlays
```

**Data flow.** Pages are prerendered as static HTML; the client store fetches
`/api/state` on mount and writes the whole dataset back (debounced) after any
change. The API validates the payload, then upserts every row and deletes what
the client removed — inside one transaction. Postgres tables are normalized:
`settings`, `categories`, `transactions`, `recurring_rules`, `subscriptions`,
`savings_accounts`, `investments`, `budgets`, `debts`.

Because a write replaces the whole dataset, a stale writer would not merely lose
its own edit — it would delete every row added since it loaded. Three guards
cover that:

- The store **never persists a state it did not first read from the server**, so
  a failed load leaves edits in the tab instead of emptying the database.
- `GET` returns the revision it read in an `ETag`; `PUT` sends it back in
  `If-Match` and the server refuses the write with **409** if the dataset moved
  on. A second tab is then told it is out of date and offered a reload, rather
  than silently overwriting the first. A `PUT` with no `If-Match` is
  unconditional, which is what restoring a backup by hand wants.
- Destructive actions carry an **Undo** that restores the state as it was, and
  closing the tab with a write still in flight warns first.

**Migrations.** `db/schema.sql` is idempotent (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, guarded renames). It runs on the database's first
boot, on every app start, and on `make <env>-migrate`. Older data shapes are
upgraded automatically in `backup.ts` and the schema, so upgrading never
requires a manual step.

**Stack:** Next.js 16.2 (App Router, React 19.2, React Compiler), TypeScript,
Tailwind CSS v4, `pg`, PostgreSQL 18, Node 26. The design is a liquid-glass
dark-first theme in Montserrat; charts are plain SVG.

**Design system.** One brand colour — spring green at OKLCH hue 156, held at the
edge of the sRGB gamut so it reads fresh rather than forest — on deliberately
neutral surfaces. The token is split by job: `--accent` is *ink* (dark on a light
page, bright on a dark one, always ≥ 4.5:1), `--accent-fill` is *surface* and
never changes theme, `--on-accent` is what goes on it. `--income` is `--accent`:
one hue, one meaning. `--expense` and `--warning` are reserved status colours and
never double as a chart series.

Everything else is a scale rather than a decision per screen:

- **Figures** — five steps, `.num-hero` … `.num-sm`, all tabular.
- **Text** — `.label`, `.caption`, `.body-strong`, `.card-title`.
- **Rhythm** — 16px between cards, 20px from `sm`, in every grid on every page.
- **Controls** — one 44px touch floor, with an explicit `size="sm"` for actions
  that live inside a row.
- **Single-choice controls are real radiogroups**: one tab stop for the group,
  arrows to move, `Home`/`End` to jump, focus travelling with the selection.
  Segmented controls, icon chips, the theme switch and the colour swatches all
  run through the same hook.
- **Sheets** put their actions in a footer that does not scroll, destructive
  action pinned to the far left.

**Chart colour is computed, not chosen.** The eight categorical slots avoid the
green and red hue bands entirely, because in this app those two *mean* income and
overspend. The hues, their steps and their order came out of an enumeration
scored by a colourblindness validator: worst adjacent pair ΔE 12.1 light / 10.6
dark under protanopia and deuteranopia, 20.4 / 19.1 under normal vision. No
eight-hue palette can clear those floors across all 28 pairs, so every series is
also directly labelled and separated by a 2px gap — identity never rests on hue
alone. Income-versus-expense charts use the status colours, not series slots.

---

## 🛠️ Local development

```bash
npm run dev      # dev server (needs DATABASE_URL)
make lint        # ESLint
make typecheck   # tsc --noEmit
make build       # production build
```

---

## 📌 Good to know

- **No authentication yet.** The database holds a single dataset, so only run it
  somewhere private — behind a VPN, on localhost, or with a reverse proxy that
  handles auth. `db/schema.sql` notes where to add an owner column.
- **Put a reverse proxy in front in production** for TLS and rate limiting, as
  the Next.js self-hosting guide recommends.
- **Exchange rates are current, not historical.** Amounts in other currencies
  are converted at today's rate, so past charts shift slightly when rates move.
  Cross-currency transfers are the exception — they store what actually arrived.
- **Back up before migrating or resetting**: Settings → Data → Export, or
  `make <env>-db-backup`.

---

## ✍️ Author

**[Illia Movchko](https://github.com/sacrificed666)**

## 📝 License

This project is licensed under the **[MIT License](https://choosealicense.com/licenses/mit/)**.
