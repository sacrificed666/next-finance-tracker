# 💰 Finance Tracker

A self-hosted personal finance dashboard for people who keep their money in more than one currency.
Track income, spending, subscriptions, accounts and investments across **₴ / $ / €**, watch your
net worth build up, and project it years ahead.

Built with Next.js 16, React 19, PostgreSQL and Tailwind v4, packaged with Docker for three
environments. Your data lives in your own database — no amounts ever leave the machine.

---

## ✨ What it does

### 📊 Dashboard

Net worth in every currency you use, this month's income, spending and net flow, a 12-month cash-flow
chart, spending by category with budget meters, the composition of what you own, a five-year outlook
and a quick-add form.

### 💸 Expenses

A month-by-month ledger with search, type, category and account filters, plus:

- **Recurring rules** that post a transaction each month between a start and an optional end month.
- **Subscriptions** with a real lifetime — monthly or yearly, billed from one month until another,
  so services that no longer bill drop out of the list instead of lingering.
- **Budgets** per category, including everything spent in its subcategories.

### 🧾 Income

Salary, freelance, interest, dividends, sales or gifts, each landing in a real account.

- A **day-rate calculator** for contract work: `days × rate + premium + compensations − cut-offs`.
- **Per-entry taxation**: FOP groups 1, 2, 3, 3 + VAT, 4, the general system, or your own regime.
  The breakdown is shown while you type and stored with the entry.
- A **limit card** that tracks this year's taxed income against the group's annual ceiling.

### 🏦 Balance

Accounts and investments as one balance sheet, every row shown in all the currencies you use.

- **Balances are derived, never typed over** — opening balance plus everything booked to the account.
- **Cryptocurrency accounts** hold several coins at once (25 supported), priced live from CoinGecko.
- **Game item accounts** for CS2, Dota 2, Team Fortress 2, Rust, PUBG or a custom game.
- **Investments** know how they earn: deposits capitalise or pay out, bonds pay coupons, funds pay
  dividends, stocks and cryptocurrency grow in price. The app picks the right model per kind.
- **Inzhur funds** (REIT, Energy, MilTech) pull their NAV, forecast yield and payout type straight
  from the published fund pages.
- **Debts** with payoff dates, interest left and monthly payment plans.

### 🔮 Forecast

Project savings and investments 1–40 years ahead: cautious, base and optimistic scenarios, one-off
planned events in any currency, optional debt subtraction, a goal with the date you reach it, and a
year-by-year table. Growth comes from what you actually hold and from the monthly contributions set
on your investments — nothing has to be typed twice.

### 🧑‍🚀 Profile

Levels and XP earned by tracking consistently and finishing months in the plus, **70 achievements**
across seven groups, and a **financial health score** built from seven parts — savings rate,
emergency fund, debt load, budget discipline, stability, diversification and investing — each with an
explanation and a tip that links to the page where you would fix it.

### ⚙️ Settings

Language, base currency, theme, the full category tree with subcategories, and JSON export / import.
**Exchange rates and asset prices refresh automatically every hour** from Monobank (with the official
NBU rate as a fallback) and CoinGecko — no buttons to press.

### 🌍 Eight languages

English, Ukrainian, German, French, Spanish, Polish, Italian and Dutch — including dates, numbers and
plural forms, with the sign-in page already in your language.

---

## 🚀 Quick start

Requires **Docker** and **Docker Compose v2**.

```bash
git clone <this-repo> && cd next-finance-tracker
make env             # create .env from .env.example, then fill it in
make dev-deploy      # build → start → apply db/schema.sql
```

Open <http://localhost:3000> and register with the address you set in `OWNER_EMAIL`.

```bash
make help            # every command, grouped by environment
make doctor          # verify docker, compose and .env
```

---

## 📚 Documentation

Everything else lives in [`docs/`](./docs/README.md):

| | |
| --- | --- |
| [Getting started](./docs/getting-started.md) | Requirements, environment variables, first run |
| [Architecture](./docs/architecture.md) | Request flow, client store, API routes |
| [Data model](./docs/data-model.md) | `AppState`, schema, migrations, backups |
| [Money and currencies](./docs/money-and-currencies.md) | Rates, conversion, formatting |
| [Taxes](./docs/taxes.md) | FOP groups, VAT, custom regimes, limits |
| [Accounts and assets](./docs/accounts-and-assets.md) | Account kinds, cryptocurrency, game items, logos |
| [Investments](./docs/investments.md) | Valuation, return types, Inzhur, live prices |
| [Budgets and schedules](./docs/budgets-and-schedules.md) | Categories, budgets, recurring, subscriptions |
| [Gamification](./docs/gamification.md) | XP, levels, achievements, health score |
| [Internationalisation](./docs/internationalisation.md) | Locales, dictionaries, plurals |
| [Design system](./docs/design-system.md) | Surfaces, layout rules, contrast and colour rationale |
| [Operations](./docs/operations.md) | Docker stacks, migrations, backups, troubleshooting |
| [Security and privacy](./docs/security-and-privacy.md) | Sessions, hashing, what leaves the machine |
| [Quality checks](./docs/quality-checks.md) | Types, lint, dictionaries, browser smoke tests |

---

## 🐳 Environments

| | 🛠️ Development | 🧪 Staging | 🚀 Production |
| --- | --- | --- | --- |
| Overlay | `docker/development.yml` | `docker/staging.yml` | `docker/production.yml` |
| Image stage | `dev` (hot reload) | `runner` (built) | `runner` (built) |
| Source | bind-mounted | baked into the image | baked into the image |
| App port | `3000` | `3001` | `3000` |
| PostgreSQL port | published | loopback only | not published |
| Restart | no | `unless-stopped` | `always` |
| Extras | polling file watch | resource limits, log rotation | limits, log rotation, `no-new-privileges`, tmpfs |

Separate compose project names (`finance-dev`, `finance-stage`, `finance-prod`) let them run side by
side. Every environment shares the same verbs: swap `dev-` for `stage-` or `prod-`.

---

## 🧱 Stack

Next.js 16.2 (App Router, React 19.2, React Compiler), TypeScript, Tailwind CSS v4, `pg`,
PostgreSQL 18, Node 26, Auth.js 5. Charts are hand-rolled SVG — no chart library.

## 📌 Good to know

- **One owner.** Registration is limited to `OWNER_EMAIL`; every API route requires a session.
- **Writes are guarded.** The store never saves a state it did not first read, `PUT /api/state`
  refuses stale writes with a `409`, and destructive actions carry an undo.
- **Exchange rates are current, not historical.** Old amounts in other currencies are converted at
  today's rate; cross-currency transfers are the exception and store what actually arrived.
- **Back up before migrating or resetting**: Settings → Data → Export, or `make <env>-db-backup`.
- **Put a reverse proxy in front in production** for TLS, and set `AUTH_URL` to the public origin.

## ✍️ Author

**[Illia Movchko](https://github.com/sacrificed666)**

## 📝 License

Licensed under the **[MIT License](https://choosealicense.com/licenses/mit/)**.
