BEGIN;

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

CREATE TABLE IF NOT EXISTS categories (
    id         text PRIMARY KEY,
    name       text NOT NULL,
    icon       text NOT NULL DEFAULT '',
    color_slot smallint NOT NULL DEFAULT 1,
    kind       text NOT NULL CHECK (kind IN ('income', 'expense'))
);

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
    end_month          char(7),
    active             boolean NOT NULL DEFAULT true,
    last_applied_month char(7)
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS end_month char(7);

CREATE TABLE IF NOT EXISTS transactions (
    id              text PRIMARY KEY,
    type            text NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount          double precision NOT NULL,
    currency        text NOT NULL,
    category_id     text NOT NULL,
    date            date NOT NULL,
    note            text,
    account_id      text,
    to_account_id   text,
    to_amount       double precision,
    recurring_id    text,
    subscription_id text,
    breakdown       jsonb,
    tax             jsonb
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_account_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_amount double precision;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('income', 'expense', 'transfer'));

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);

CREATE TABLE IF NOT EXISTS savings_accounts (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    icon            text NOT NULL DEFAULT '',
    kind            text NOT NULL DEFAULT 'card'
                    CHECK (kind IN ('card', 'cash', 'savings', 'wallet', 'other')),
    currency        text NOT NULL,
    opening_balance double precision NOT NULL DEFAULT 0,
    goal_target     double precision,
    goal_deadline   date
);

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
    CHECK (kind IN ('card', 'cash', 'savings', 'wallet', 'crypto', 'skins', 'other'));
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS game text;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS bank text;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS game_name text;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS game_logo text;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS holdings jsonb;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS priced_at timestamptz;

CREATE TABLE IF NOT EXISTS investments (
    id                   text PRIMARY KEY,
    name                 text NOT NULL,
    kind                 text NOT NULL DEFAULT 'deposit'
                         CHECK (kind IN ('deposit', 'bonds', 'reit', 'inzhur', 'stocks', 'crypto', 'other')),
    currency             text NOT NULL,
    principal            double precision NOT NULL,
    annual_rate_pct      double precision NOT NULL,
    start_date           date NOT NULL,
    end_date             date,
    compounding          text NOT NULL CHECK (compounding IN ('reinvest', 'payout')),
    compounding_freq     text NOT NULL CHECK (compounding_freq IN ('monthly', 'quarterly', 'annually')),
    monthly_contribution double precision,
    note                 text
);

ALTER TABLE investments ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE investments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'deposit';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS market_value double precision;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS coin text;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS quantity double precision;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS priced_at timestamptz;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS coin_icon text;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS fund text;
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_kind_check;
ALTER TABLE investments ADD CONSTRAINT investments_kind_check
    CHECK (kind IN ('deposit', 'bonds', 'reit', 'inzhur', 'stocks', 'crypto', 'other'));

CREATE TABLE IF NOT EXISTS budgets (
    category_id  text PRIMARY KEY,
    limit_amount double precision NOT NULL CHECK (limit_amount > 0),
    currency     text NOT NULL
);

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

CREATE TABLE IF NOT EXISTS users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text,
    email           text UNIQUE,
    "emailVerified" timestamptz,
    image           text,
    password_hash   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS accounts (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                text NOT NULL,
    provider            text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token       text,
    access_token        text,
    expires_at          bigint,
    id_token            text,
    scope               text,
    session_state       text,
    token_type          text,
    UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires        timestamptz NOT NULL,
    "sessionToken" text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS verification_token (
    identifier text NOT NULL,
    expires    timestamptz NOT NULL,
    token      text NOT NULL,
    PRIMARY KEY (identifier, token)
);

INSERT INTO users (id, name, email)
VALUES ('00000000-0000-0000-0000-000000000000', 'Unclaimed data', NULL)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
    t text;
    pk text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'categories', 'recurring_rules', 'subscriptions', 'transactions',
        'savings_accounts', 'investments', 'budgets', 'debts'
    ] LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL
                 DEFAULT ''00000000-0000-0000-0000-000000000000''', t);
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = t || '_user_fk'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id)
                     REFERENCES users(id) ON DELETE CASCADE', t, t || '_user_fk');
        END IF;
        pk := CASE WHEN t = 'budgets' THEN 'category_id' ELSE 'id' END;
        IF EXISTS (
            SELECT 1 FROM pg_index i
             WHERE i.indrelid = t::regclass AND i.indisprimary
               AND i.indnatts = 1
        ) THEN
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_pkey');
            EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (user_id, %I)', t, pk);
        END IF;
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (user_id)', t || '_user_idx', t);
    END LOOP;
END $$;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE settings SET user_id = '00000000-0000-0000-0000-000000000000' WHERE user_id IS NULL;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_id_check') THEN
        ALTER TABLE settings DROP CONSTRAINT settings_id_check;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_index i
         WHERE i.indrelid = 'settings'::regclass AND i.indisprimary AND i.indnatts = 1
    ) THEN
        ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
        ALTER TABLE settings ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE settings ADD PRIMARY KEY (user_id);
        ALTER TABLE settings ALTER COLUMN id DROP NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_user_fk') THEN
        ALTER TABLE settings ADD CONSTRAINT settings_user_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS about text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_secret text;

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id text;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_regime text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_vat_pct double precision NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS tax_label text;
ALTER TABLE settings DROP COLUMN IF EXISTS rate_pln;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_base_currency_check;
ALTER TABLE settings ADD CONSTRAINT settings_base_currency_check
    CHECK (base_currency IN ('UAH', 'USD', 'EUR'));

-- encrypted record payloads
ALTER TABLE categories ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE recurring_rules ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE savings_accounts ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS secret text;
ALTER TABLE categories ALTER COLUMN name DROP NOT NULL;
ALTER TABLE categories ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE categories ALTER COLUMN color_slot DROP NOT NULL;
ALTER TABLE categories ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN type DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN day_of_month DROP NOT NULL;
ALTER TABLE recurring_rules ALTER COLUMN start_month DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN name DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN price DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN period DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN day_of_month DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN start_month DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN active DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN type DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE transactions ALTER COLUMN date DROP NOT NULL;
ALTER TABLE savings_accounts ALTER COLUMN name DROP NOT NULL;
ALTER TABLE savings_accounts ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE savings_accounts ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE savings_accounts ALTER COLUMN opening_balance DROP NOT NULL;
ALTER TABLE savings_accounts ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN name DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN principal DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN annual_rate_pct DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN compounding DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN compounding_freq DROP NOT NULL;
ALTER TABLE investments ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE budgets ALTER COLUMN limit_amount DROP NOT NULL;
ALTER TABLE budgets ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE debts ALTER COLUMN name DROP NOT NULL;
ALTER TABLE debts ALTER COLUMN icon DROP NOT NULL;
ALTER TABLE debts ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE debts ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE debts ALTER COLUMN balance DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN base_currency DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN theme DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN tax_rate_pct DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN tax_fixed_uah DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN rate_usd DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN rate_eur DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN rates_source DROP NOT NULL;
ALTER TABLE settings ALTER COLUMN tax_vat_pct DROP NOT NULL;
