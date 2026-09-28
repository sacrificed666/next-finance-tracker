# 🗃️ Data model

## 📦 `AppState`

One object holds everything. It is what `/api/state` returns, what the store keeps in memory and
what a JSON backup contains.

```ts
interface AppState {
  version: number;
  transactions: Transaction[];   // income, expense, transfer
  categories: Category[];        // two levels: parents and children
  recurring: RecurringRule[];    // auto-posted monthly entries
  subscriptions: Subscription[]; // services billed monthly or yearly
  savings: SavingsAccount[];     // cards, cash, wallets, cryptocurrency, game items
  investments: Investment[];     // deposits, bonds, funds, stocks, cryptocurrency
  budgets: Budget[];             // monthly limit per category
  debts: Debt[];                 // loans, mortgages, card debt
  receivables: Receivable[];     // money you lent and expect back
  rules: CategoryRule[];         // "description contains … → category", for imports
  wishlist: WishItem[];          // things to buy, with a price and a priority
  plannedEvents: PlannedEvent[]; // one-off amounts the forecast adds in a given month
  snapshots: NetWorthSnapshot[]; // one per day: net worth and its parts, in UAH
  settings: Settings;            // base currency, locale, theme, rates, tax profile, paid taxes, bank links
}
```

### Entities worth knowing

| Entity | Key fields | Notes |
| --- | --- | --- |
| `Transaction` | `type`, `amount`, `currency`, `categoryId`, `date`, `accountId`, `toAccountId`, `tax`, `breakdown`, `tags?`, `splitId?`, `attachmentIds?`, `externalId?` | Transfers carry `toAmount` for cross-currency moves; `amount` on a taxed income is the **net** amount, with the gross kept in `tax.gross`. The pieces of a split purchase share a `splitId`; imported entries keep the bank's id in `externalId` |
| `Category` | `kind`, `parentId?`, `icon`, `colorSlot` | One level of nesting; charts roll children into parents |
| `SavingsAccount` | `kind`, `currency`, `openingBalance`, `holdings?`, `goal?`, `bank?`, `game?` | Balance = opening balance + ledger + coin holdings |
| `Investment` | `kind`, `principal`, `annualRatePct`, `marketValue?`, `quantity?`, `fund?`, `compounding` | Valuation depends on the kind — see [Investments](./investments.md) |
| `Subscription` | `price`, `period`, `dayOfMonth`, `startMonth`, `endMonth?`, `active` | A subscription lives between two months; see [Budgets and schedules](./budgets-and-schedules.md) |
| `Budget` | `categoryId`, `limit`, `currency`, `rollover?` | With `rollover`, last month's unspent amount is added to this month's limit — one month's worth, never more |
| `Receivable` | `name`, `amount`, `currency`, `date`, `dueDate?`, `repaid` | Counts towards net worth until repaid in full |
| `NetWorthSnapshot` | `date`, `total`, `savings`, `investments`, `debts`, `receivables`, `rates` | Written quietly once a day (and again when the total moves), so the history shows what you really had, not a recomputation |
| `Settings` | `baseCurrency`, `locale`, `theme`, `rates`, `ratesMeta`, `tax`, `taxPaid?`, `bankLinks?` | `tax` remembers the regime last used when adding income; `taxPaid` marks tax-calendar items as paid; `bankLinks` maps Monobank cards to accounts |

## 🧱 Database schema

`db/schema.sql` is the single source of truth and is **idempotent**: it creates tables if missing and
then applies `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for everything added later. Running it twice
changes nothing.

```bash
make dev-migrate     # psql -v ON_ERROR_STOP=1 … < db/schema.sql
```

Tables: `users`, `accounts`, `sessions`, `verification_token` (Auth.js), plus `settings`,
`categories`, `recurring_rules`, `subscriptions`, `transactions`, `savings_accounts`,
`investments`, `budgets`, `debts` — every row scoped by `user_id`.

Newer record types use **sealed-only** tables with nothing but `(user_id, id, secret)`:
`category_rules`, `receivables`, `wishlist_items`, `planned_events` and `net_worth_snapshots` (keyed by
date). Two more hold data that never travels with `AppState`:

| Table | Holds |
| --- | --- |
| `integrations` | One row per connected bank (`provider = 'monobank'`): the sealed token and card list |
| `attachments` | Receipt photos, sealed, with their type. Photos no entry refers to any more are removed a day after the save that dropped them |

> [!NOTE]
> The app also applies the schema on first database use (`src/lib/server/db.ts`), so a fresh container is
> usable without a manual migration step.

Every data table also has a `secret` column holding the encrypted record — see
[Security and privacy](./security-and-privacy.md). The columns below are what the app falls back to
for rows written before encryption was introduced.

Columns that hold structured values use `jsonb`: `transactions.breakdown`, `transactions.tax`,
`savings_accounts.holdings`, `settings.rates_meta`.

> [!WARNING]
> Check constraints list the allowed enum values (`savings_accounts.kind`, `investments.kind`,
> `settings.base_currency`, …). Adding a new kind in TypeScript **and** forgetting the constraint
> makes every save fail with a 500. Both live next to each other in `db/schema.sql`.

## 🧼 Normalisation is the gate

`src/lib/state/backup.ts` exposes `normalizeState(raw)`, which is called:

- when the server loads rows (`lib/server/repo.ts`),
- when the server accepts a `PUT`,
- when the client receives state,
- when a JSON backup is imported.

It drops unknown fields, clamps numbers, validates enums and URLs, and performs small migrations
(legacy balance → opening balance, old category names, yearly subscriptions, tax profiles, return
types per investment kind).

> [!TIP]
> Anything that must survive a round trip has to be handled in `normalizeState`. If a new field is
> not listed there, it will silently disappear on the next save.

## 💾 Backups

| Kind | How | Where |
| --- | --- | --- |
| JSON (app data only) | Settings → Data → Download | Browser download, restorable via Import |
| SQL (everything) | `make dev-db-backup` / `stage-` / `prod-` | `backups/<env>-<timestamp>.sql` |
| Nightly (production) | The `backup` service, checked and kept 14 days — see [Operations](./operations.md#-backups) | `backups/auto/prod-<timestamp>.dump` |

Restore with `make dev-db-restore FILE=backups/dev-….sql`.

> [!CAUTION]
> Take a SQL dump before schema changes on real data. Import in the app **replaces** all current
> data — it is not a merge.
