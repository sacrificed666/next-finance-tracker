# 💰 Finance Tracker

A self-hosted personal finance dashboard for people who keep their money in more than one currency.
Track income, spending, subscriptions, accounts and investments across **₴ / $ / €**, watch your
net worth build up, and project it years ahead.

Built with Next.js 16, React 19, PostgreSQL and Tailwind v4, packaged with Docker for three
environments. Your data lives in your own database — no amounts ever leave the machine.

---

## ✨ What it does

### 📊 Dashboard

Net worth over the last year — from **daily snapshots** the app records by itself — this month's
income, spending and savings rate against last month, a quick-add form, a cash-flow chart, spending
by category with every budget's meter, **cash ahead** (what your liquid accounts will hold each day
of the next 30 or 60 days, and the day they would dip below zero), subscriptions, your largest
holdings and the currencies you hold them in. The cards below the headline can be **hidden and
reordered**; the arrangement is saved with the account, so every device shows the same overview.

Every page follows the same skeleton: a full-width main block with the page's headline figure, its
trend or make-up and the figures that explain it, then a wide main column with charts and lists and a
narrow side column with summaries and breakdowns.

### 💸 Expenses

A month-by-month ledger with search, type, category and account filters, the month's spending per
day, and a pace chart of the running total against the month before, plus:

- **Recurring rules** that post a transaction each month between a start and an optional end month.
  Rules that book a whole budget as spent every month are pointed out, with an offer to stop them.
- **Subscriptions** with a real lifetime — monthly or yearly, billed from one month until another,
  so services that no longer bill drop out of the list instead of lingering. Charges that repeat
  monthly in an imported statement are offered as new subscriptions.
- **Budgets** per category, including everything spent in its subcategories. A budget can **carry
  over** last month's unspent money, and warns on the day this month's pace would run it out.
- **Tags** across categories (`#trip`, `#work`), with a tag filter and search.
- **Split one purchase** across several categories — a supermarket receipt with food and household.
- **Receipt photos** on any entry, shrunk in the browser and stored encrypted.
- **Bulk edit** — tick several entries to change their category, add a tag or delete them at once.
- **Learns from corrections** — move an imported entry to another category and it offers to file that
  merchant there from now on, and to move its earlier entries too.
- **Export** the entries on screen, with every filter applied, as a CSV for a spreadsheet.

### 🧾 Income

Salary, freelance, interest, dividends, sales or gifts, each landing in a real account.

- A **day-rate calculator** for contract work: `days × rate + premium + compensations − cut-offs`.
- **Per-entry taxation**: FOP groups 1, 2, 3, 3 + VAT, 4, the general system, or your own regime.
  The breakdown is shown while you type and stored with the entry.
- A **limit card** that tracks this year's taxed income against the group's annual ceiling.
- **Income by month** with the tax withheld stacked on top, so each column's height is the gross.
- A **tax calendar** for FOP groups 1–3: declarations, single tax, military levy, ЄСВ and VAT with
  their deadlines. Ticking one off books the payment as an expense under taxes.
- A **quarterly summary** — income, tax and ЄСВ per quarter, with foreign-currency income converted at
  the **NBU rate of the day it arrived**, the running totals a group 3 declaration asks for, and the
  **income book** as a CSV for a spreadsheet.
- **Figures per year** — the minimum wage and subsistence minimum behind every fixed amount and
  limit are kept for each year, so last year's income is taxed by last year's rules.

### 🏦 Accounts

Every account with its balance in all the currencies you use, savings goals and debts — with how
many months of spending your emergency fund covers and how the money splits by account type or
currency.

- **Balances are derived, never typed over** — opening balance plus everything booked to the account.
- **Checked against the bank** — accounts linked to Monobank show whether they match the bank's
  balance, and one tap books the difference.
- **Cryptocurrency accounts** hold several coins at once (25 supported), priced live from CoinGecko.
- **Game item accounts** for CS2, Dota 2, Team Fortress 2, Rust, PUBG or a custom game.
- **Savings goals** roll up into one card: overall progress, the goals closest to done, and what it
  takes each month to meet every deadline.
- **Debts** with payoff dates, interest left and monthly payment plans.
- **Empty accounts** fold into one row at the end of the list until you ask to see them.
- **Money owed to you** — what you lent, to whom, when it is due and how much came back; it counts
  towards net worth.

### 📈 Investments

Deposits, bonds, funds, stocks and cryptocurrency on their own page: totals, where they head over
the next year, allocation by type, and the positions — as detailed cards or a compact returns table.

- **Every position** knows how it earns: deposits capitalise or pay out, bonds pay coupons, funds pay
  dividends, stocks and cryptocurrency grow in price. The app picks the right model per kind.
- **Inzhur funds** (REIT, Energy, MilTech) pull their NAV, forecast yield and payout type straight
  from the published fund pages.
- **Next 12 months** shows what your investments are expected to add over the coming year.
- **Schedule** sums the monthly top-ups going in and the interest and dividends coming out, lists
  the positions that mature next, and offers **reinvest or withdraw** for any whose term has ended.

### 🔮 Forecast

Project savings and investments 1–40 years ahead: cautious, base and optimistic scenarios, one-off
planned events in any currency, optional debt subtraction, a goal with the date you reach it, and a
year-by-year table. Growth comes from what you actually hold, from the monthly contributions set on
your investments and from what you usually keep each month — nothing has to be typed twice.

A **wishlist** sits beside it: what you want, what it costs, how many months of your usual surplus it
takes, and — once you give it a month — a planned event in the forecast.

### 📅 Calendar

The month as a grid: every day's spending shaded by size, entries and tax deadlines as coloured dots,
the month's key dates — maturing investments, money due back, wishlist plans — and the day you tap
listed in full, with a button that adds an entry on exactly that date.

### 📑 Reports

Any period — a month, a quarter or a year — against the one before: categories compared side by side,
each category's trend as a small chart, the biggest changes, the largest expenses, spending by tag,
and a year in review. The comparison downloads as a CSV, and **PDF** prints the page (or saves it as
a PDF) without the navigation and always in the light theme.

### 🧑‍🚀 Profile

Levels and XP earned by tracking consistently and finishing months in the plus, **70 achievements**
across seven groups, and a **financial health score** built from seven parts — savings rate,
emergency fund, debt load, budget discipline, stability, diversification and investing — each with an
explanation and a tip that links to the page where you would fix it.

The sign-in card sets or changes the password, links Google, turns on **two-step verification** with
any authenticator app (plus eight single-use recovery codes) and **signs out every device** at once.

### ⚙️ Settings

Language, base currency, theme, the full category tree with subcategories, and JSON export / import.
**Bank import** reads Monobank directly (with your personal token, kept encrypted on the server) or any
bank's CSV statement, suggests a category for every row from your own rules and the merchant code, and
skips what is already in the ledger. Transfers between your own cards and jars become one transfer,
cash machine withdrawals move money to your wallet, and a payment you had planned (rent, a
subscription) fills in the plan instead of doubling it. On a public https address, Monobank can also
send each new operation as it happens.
**Exchange rates and asset prices refresh automatically every hour** from Monobank (with the official
NBU rate as a fallback) and CoinGecko — no buttons to press.
**Notifications** bring a short note each morning to the devices you switch on: payments and income
planned for today and tomorrow, taxes coming due and money someone should return.

### ⌨️ Everywhere

- **Ctrl + K** (⌘K on a Mac) opens a command palette: jump to any page, account or position, start a
  new entry, switch the theme, or find an entry by its note, category, tag or amount.
- **Installable** as an app on a phone or desktop, with shortcuts to add an expense or income from
  the icon.

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
| [Bank import](./docs/bank-import.md) | Monobank, CSV statements, categorisation rules, duplicates |
| [Forecast](./docs/forecast.md) | Projection, scenarios, goals, wishlist |
| [Notifications](./docs/notifications.md) | The morning note of what is due |
| [Gamification](./docs/gamification.md) | XP, levels, achievements, health score |
| [Internationalisation](./docs/internationalisation.md) | Locales, dictionaries, plurals |
| [Design system](./docs/design-system.md) | Surfaces, layout rules, contrast and colour rationale |
| [Operations](./docs/operations.md) | Docker stacks, migrations, backups, troubleshooting |
| [Security and privacy](./docs/security-and-privacy.md) | Sessions, hashing, two-step verification, what leaves the machine |
| [Quality checks](./docs/quality-checks.md) | Types, lint, unit and browser tests, CI |

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
- **Saves are small and merge.** An edit sends only the records it changed; two devices editing
  different records both keep their work, and destructive actions carry an undo.
- **Past months keep their exchange rate.** Income and spending are counted at the NBU's average rate
  of their month, balances and net worth at today's; cross-currency transfers store what actually
  arrived.
- **Back up before migrating or resetting**: Settings → Data → Export, or `make <env>-db-backup`.
- **Put a reverse proxy in front in production** for TLS, and set `AUTH_URL` to the public origin.

## ✍️ Author

**[Illia Movchko](https://github.com/sacrificed666)**

## 📝 License

Licensed under the **[MIT License](https://choosealicense.com/licenses/mit/)**.
