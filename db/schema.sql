-- Finance tracker schema — idempotent, safe to run on every deploy.
-- Mounted into the Postgres container's docker-entrypoint-initdb.d for a fresh
-- volume, and applied by `make <env>-migrate` for existing ones.
--
-- There is no auth yet, so this holds a single dataset. When users arrive, add
-- an `owner_id` column to every table plus a composite primary key.

BEGIN;

-- ─────────────────────────── settings (singleton) ───────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    base_currency    text NOT NULL DEFAULT 'UAH' CHECK (base_currency IN ('UAH', 'USD', 'EUR')),
    theme            text NOT NULL DEFAULT 'dark' CHECK (theme IN ('system', 'light', 'dark')),
    tax_rate_pct     double precision NOT NULL DEFAULT 6,
    tax_fixed_uah    double precision NOT NULL DEFAULT 1902.34,
    rate_usd         double precision NOT NULL DEFAULT 44.6,
    rate_eur         double precision NOT NULL DEFAULT 50.8,
    rates_meta       jsonb,
    rates_updated_at timestamptz,
    rates_source     text NOT NULL DEFAULT 'manual' CHECK (rates_source IN ('manual', 'nbu', 'monobank')),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────── categories ────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    icon       text NOT NULL DEFAULT '',
    color_slot smallint NOT NULL DEFAULT 1,
    kind       text NOT NULL CHECK (kind IN ('income', 'expense'))
);

-- ───────────────────────────── recurring rules ──────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_rules (
    id                 text PRIMARY KEY,
    type               text NOT NULL CHECK (type IN ('income', 'expense')),
    amount             double precision NOT NULL,
    currency           text NOT NULL,
    category_id        text NOT NULL,
    note               text,
    account_id         text,
    day_of_month       smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month        char(7) NOT NULL,
    end_month          char(7),
    last_applied_month char(7)
);

ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS account_id text;

-- ─────────────────────────────── subscriptions ──────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id                 text PRIMARY KEY,
    name               text NOT NULL,
    icon               text NOT NULL DEFAULT '',
    price              double precision NOT NULL,
    currency           text NOT NULL,
    period             text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'yearly')),
    account_id         text,
    day_of_month       smallint NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_month        char(7) NOT NULL,
    -- last month to charge for, inclusive; NULL = open-ended
    end_month          char(7),
    active             boolean NOT NULL DEFAULT true,
    last_applied_month char(7)
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS end_month char(7);

-- ──────────────────────────────── transactions ──────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id              text PRIMARY KEY,
    type            text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount          double precision NOT NULL,
    currency        text NOT NULL,
    category_id     text NOT NULL,
    date            date NOT NULL,
    note            text,
    -- account the money moved through; transfers also carry a destination and
    -- the amount that arrived there (differs on a cross-currency move)
    account_id      text,
    to_account_id   text,
    to_amount       double precision,
    recurring_id    text,
    subscription_id text,
    -- day-rate composition and ФОП tax detail on income rows
    breakdown       jsonb,
    tax             jsonb
);

-- upgrade databases created before accounts and transfers existed
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_account_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_amount double precision;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('income', 'expense', 'transfer'));

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);

-- ─────────────────────────────── savings accounts ───────────────────────────
-- `opening_balance` is what the account held when tracking started; the live
-- balance is that plus every transaction assigned to the account.
CREATE TABLE IF NOT EXISTS savings_accounts (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    icon            text NOT NULL DEFAULT '',
    -- where the money sits; affects no arithmetic, only how the balance sheet
    -- groups liquidity
    kind            text NOT NULL DEFAULT 'card'
                    CHECK (kind IN ('card', 'cash', 'savings', 'wallet', 'other')),
    currency        text NOT NULL,
    opening_balance double precision NOT NULL DEFAULT 0,
    goal_target     double precision,
    goal_deadline   date
);

-- Rename the pre-accounts column, keeping the stored figure as the opening
-- one. RENAME COLUMN has no IF EXISTS, so it is guarded to stay idempotent.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'savings_accounts' AND column_name = 'balance'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'savings_accounts' AND column_name = 'opening_balance'
    ) THEN
        ALTER TABLE savings_accounts RENAME COLUMN balance TO opening_balance;
    END IF;
END $$;

ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS opening_balance double precision NOT NULL DEFAULT 0;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'card';
ALTER TABLE savings_accounts DROP CONSTRAINT IF EXISTS savings_accounts_kind_check;
ALTER TABLE savings_accounts ADD CONSTRAINT savings_accounts_kind_check
    CHECK (kind IN ('card', 'cash', 'savings', 'wallet', 'other'));

-- ──────────────────────────────── investments ───────────────────────────────
CREATE TABLE IF NOT EXISTS investments (
    id                   text PRIMARY KEY,
    name                 text NOT NULL,
    -- what sort of holding it is; decides whether the value is computed from a
    -- rate (deposit, bonds) or simply stated by the owner (reit, stocks, crypto)
    kind                 text NOT NULL DEFAULT 'deposit'
                         CHECK (kind IN ('deposit', 'bonds', 'reit', 'stocks', 'crypto', 'other')),
    currency             text NOT NULL,
    principal            double precision NOT NULL,
    annual_rate_pct      double precision NOT NULL,
    start_date           date NOT NULL,
    -- maturity; NULL for an open-ended holding that never stops earning
    end_date             date,
    compounding          text NOT NULL CHECK (compounding IN ('reinvest', 'payout')),
    compounding_freq     text NOT NULL CHECK (compounding_freq IN ('monthly', 'quarterly', 'annually')),
    monthly_contribution double precision,
    note                 text
);

ALTER TABLE investments ADD COLUMN IF NOT EXISTS end_date date;

-- positions predating kinds were all rate-bearing deposits, which is what the
-- default says; market_value stays NULL for them and is unused
ALTER TABLE investments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'deposit';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS market_value double precision;
-- crypto positions hold a quantity of a coin; market_value is that quantity
-- times the price fetched at priced_at, so the app writes it rather than the user
ALTER TABLE investments ADD COLUMN IF NOT EXISTS coin text;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS quantity double precision;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS priced_at timestamptz;
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_kind_check;
ALTER TABLE investments ADD CONSTRAINT investments_kind_check
    CHECK (kind IN ('deposit', 'bonds', 'reit', 'stocks', 'crypto', 'other'));

-- ────────────────────────────────── budgets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
    category_id  text PRIMARY KEY,
    limit_amount double precision NOT NULL CHECK (limit_amount > 0),
    currency     text NOT NULL
);

-- ─────────────────────────────────── debts ──────────────────────────────────
-- Liabilities (mortgage, loan, credit card). `balance` is what is still owed
-- and is subtracted from net worth; you lower it manually as you pay it down.
CREATE TABLE IF NOT EXISTS debts (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    icon            text NOT NULL DEFAULT '',
    kind            text NOT NULL DEFAULT 'loan' CHECK (kind IN ('mortgage', 'loan', 'card')),
    currency        text NOT NULL,
    balance         double precision NOT NULL DEFAULT 0,
    principal       double precision,
    annual_rate_pct double precision,
    monthly_payment double precision,
    note            text
);

COMMIT;
