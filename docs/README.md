# 📚 Documentation

Everything you need to run, understand and extend the finance tracker — a self-hosted, single-owner
money tracker built with Next.js 16, React 19, PostgreSQL and Tailwind v4.

> [!NOTE]
> These pages describe the app as it is built, not as it might be. When code and docs disagree, the
> code wins — please fix the page you were reading.

## 🚀 Start here

| Page | What it covers |
| --- | --- |
| [Getting started](./getting-started.md) | Requirements, environment, first run, everyday commands |
| [Architecture](./architecture.md) | Request flow, the client store, API routes, rendering model |
| [Data model](./data-model.md) | `AppState`, database schema, migrations, normalisation, backups |

## 💸 Money features

| Page | What it covers |
| --- | --- |
| [Money and currencies](./money-and-currencies.md) | Base currency, exchange rates, rounding, formatting |
| [Taxes](./taxes.md) | FOP groups, VAT, custom regimes, per-income tax, annual limits |
| [Accounts and assets](./accounts-and-assets.md) | Account kinds, cryptocurrency accounts, game items, brand logos |
| [Investments](./investments.md) | Valuation, return types, Inzhur funds, live prices |
| [Budgets and schedules](./budgets-and-schedules.md) | Categories, budgets, recurring rules, subscriptions |

## 🎮 Experience

| Page | What it covers |
| --- | --- |
| [Gamification](./gamification.md) | XP, levels, ranks, 70 achievements, financial health score |
| [Internationalisation](./internationalisation.md) | Eight locales, dictionary contract, plurals, formatting |
| [Design system](./design-system.md) | Glass surfaces, layout rules, toolbars, theming, responsive pitfalls |

## 🛠️ Running it

| Page | What it covers |
| --- | --- |
| [Operations](./operations.md) | Docker stacks, Makefile targets, migrations, backups, hot reload |
| [Security and privacy](./security-and-privacy.md) | Sessions, password hashing, what leaves the machine |
| [Quality checks](./quality-checks.md) | Type checks, linting, dictionary validation, browser smoke tests |

## 🗺️ Repository map

```text
db/schema.sql          idempotent schema — safe to re-run, doubles as the migration file
docker/                per-environment compose overlays (development, staging, production)
docs/                  you are here
public/brands/         self-hosted bank, fintech and exchange logos
public/games/          self-hosted game icons for game-item accounts
src/app/               routes: pages, API handlers, global styles
src/components/        UI kit (ui.tsx), charts, navigation, one file per page
src/lib/               domain logic: money, taxes, investments, gamification, i18n, persistence
Makefile               every operational command, grouped by environment
```
