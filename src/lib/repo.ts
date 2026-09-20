import "server-only";

import type { PoolClient } from "pg";
import { ensureSchema, getPool, withTransaction } from "./db";
import { normalizeState } from "./backup";
import { openRecord, sealRecord } from "./secrets";
import type {
  AppState,
  Budget,
  Category,
  Debt,
  Investment,
  Locale,
  RecurringRule,
  SavingsAccount,
  Settings,
  Subscription,
  Transaction,
} from "./types";

export interface StateEnvelope {
  state: AppState;
  revision: string;
}

export class StateConflictError extends Error {
  constructor() {
    super(
      "This dataset changed somewhere else — another tab or device saved after you loaded it. Reload to pick up the newer version.",
    );
    this.name = "StateConflictError";
  }
}

async function currentRevision(client: PoolClient, userId: string): Promise<string> {
  const res = await client.query(
    `SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision
       FROM settings WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  return res.rows[0]?.revision ?? "";
}

export const UNCLAIMED_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function claimOrphanData(userId: string): Promise<number> {
  if (userId === UNCLAIMED_USER_ID) return 0;
  return withTransaction(async (client) => {
    let moved = 0;
    for (const table of [
      "settings", "categories", "recurring_rules", "subscriptions",
      "transactions", "savings_accounts", "investments", "budgets", "debts",
    ]) {
      const res = await client.query(
        `UPDATE ${table} SET user_id = $1
          WHERE user_id = $2
            AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.user_id = $1)`,
        [userId, UNCLAIMED_USER_ID],
      );
      moved += res.rowCount ?? 0;
    }
    return moved;
  });
}

export async function loadState(
  userId: string,
  fallbackLocale: Locale = "en",
): Promise<StateEnvelope> {
  await ensureSchema();
  const pool = getPool();

  const [settings, categories, recurring, subscriptions, transactions, savings, investments, budgets, debts] =
    await Promise.all([
      pool.query(
        `SELECT base_currency, theme, locale, tax_regime, tax_rate_pct, tax_fixed_uah,
                tax_vat_pct, tax_label, rate_usd, rate_eur,
                rates_meta, rates_source, secret,
                to_char(rates_updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') AS rates_updated_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision
           FROM settings WHERE user_id = $1`, [userId]
      ),
      pool.query(`SELECT id, name, icon, color_slot, kind, parent_id, secret FROM categories WHERE user_id = $1`, [userId]),
      pool.query(
        `SELECT id, type, amount, currency, category_id, note, account_id,
                day_of_month, start_month, end_month, last_applied_month, secret
           FROM recurring_rules WHERE user_id = $1`, [userId],
      ),
      pool.query(
        `SELECT id, name, icon, price, currency, period, account_id,
                day_of_month, start_month, end_month, active, last_applied_month, secret
           FROM subscriptions WHERE user_id = $1`, [userId],
      ),
      pool.query(
        `SELECT id, type, amount, currency, category_id,
                to_char(date, 'YYYY-MM-DD') AS date,
                note, account_id, to_account_id, to_amount,
                recurring_id, subscription_id, breakdown, tax, secret
           FROM transactions WHERE user_id = $1`, [userId],
      ),
      pool.query(
        `SELECT id, name, icon, kind, game, game_name, game_logo, bank, currency, opening_balance, goal_target,
                to_char(goal_deadline, 'YYYY-MM-DD') AS goal_deadline, holdings,
                to_char(priced_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') AS priced_at, secret
           FROM savings_accounts WHERE user_id = $1`, [userId],
      ),
      pool.query(
        `SELECT id, name, kind, currency, principal, annual_rate_pct, market_value, coin, fund, coin_icon, quantity,
                to_char(priced_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') AS priced_at,
                to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date,
                compounding, compounding_freq, monthly_contribution, note, secret
           FROM investments WHERE user_id = $1`, [userId],
      ),
      pool.query(`SELECT category_id, limit_amount, currency, secret FROM budgets WHERE user_id = $1`, [userId]),
      pool.query(
        `SELECT id, name, icon, kind, currency, balance, principal,
                annual_rate_pct, monthly_payment, note, secret
           FROM debts WHERE user_id = $1`, [userId],
      ),
    ]);

  const s = settings.rows[0];

  const state = normalizeState({
    version: 1,
    transactions: transactions.rows.map((r) => openRecord<Transaction>(r.secret) ?? ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      currency: r.currency,
      categoryId: r.category_id,
      date: r.date,
      note: r.note ?? undefined,
      accountId: r.account_id ?? undefined,
      toAccountId: r.to_account_id ?? undefined,
      toAmount: r.to_amount ?? undefined,
      recurringId: r.recurring_id ?? undefined,
      subscriptionId: r.subscription_id ?? undefined,
      breakdown: r.breakdown ?? undefined,
      tax: r.tax ?? undefined,
    })),
    categories: categories.rows.map((r) => openRecord<Category>(r.secret) ?? ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      colorSlot: r.color_slot,
      kind: r.kind,
      parentId: r.parent_id ?? undefined,
    })),
    recurring: recurring.rows.map((r) => openRecord<RecurringRule>(r.secret) ?? ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      currency: r.currency,
      categoryId: r.category_id,
      note: r.note ?? undefined,
      accountId: r.account_id ?? undefined,
      dayOfMonth: r.day_of_month,
      startMonth: r.start_month,
      endMonth: r.end_month ?? undefined,
      lastAppliedMonth: r.last_applied_month ?? undefined,
    })),
    subscriptions: subscriptions.rows.map((r) => openRecord<Subscription>(r.secret) ?? ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      price: r.price,
      currency: r.currency,
      period: r.period,
      accountId: r.account_id ?? undefined,
      dayOfMonth: r.day_of_month,
      startMonth: r.start_month,
      endMonth: r.end_month ?? undefined,
      active: r.active,
      lastAppliedMonth: r.last_applied_month ?? undefined,
    })),
    savings: savings.rows.map((r) => openRecord<SavingsAccount>(r.secret) ?? ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      kind: r.kind,
      game: r.game ?? undefined,
      gameName: r.game_name ?? undefined,
      gameLogo: r.game_logo ?? undefined,
      bank: r.bank ?? undefined,
      currency: r.currency,
      openingBalance: r.opening_balance,
      holdings: Array.isArray(r.holdings) ? r.holdings : undefined,
      pricedAt: r.priced_at ?? undefined,
      goal:
        r.goal_target != null
          ? { target: r.goal_target, deadline: r.goal_deadline ?? undefined }
          : undefined,
    })),
    investments: investments.rows.map((r) => openRecord<Investment>(r.secret) ?? ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      currency: r.currency,
      principal: r.principal,
      annualRatePct: r.annual_rate_pct,
      marketValue: r.market_value ?? undefined,
      coin: r.coin ?? undefined,
      fund: r.fund ?? undefined,
      quantity: r.quantity ?? undefined,
      pricedAt: r.priced_at ?? undefined,
      coinIcon: r.coin_icon ?? undefined,
      startDate: r.start_date,
      endDate: r.end_date ?? undefined,
      compounding: r.compounding,
      compoundingFreq: r.compounding_freq,
      monthlyContribution: r.monthly_contribution ?? undefined,
      note: r.note ?? undefined,
    })),
    budgets: budgets.rows.map((r) => openRecord<Budget>(r.secret) ?? ({
      categoryId: r.category_id,
      limit: r.limit_amount,
      currency: r.currency,
    })),
    debts: debts.rows.map((r) => openRecord<Debt>(r.secret) ?? ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      kind: r.kind,
      currency: r.currency,
      balance: r.balance,
      principal: r.principal ?? undefined,
      annualRatePct: r.annual_rate_pct ?? undefined,
      monthlyPayment: r.monthly_payment ?? undefined,
      note: r.note ?? undefined,
    })),
    settings: s
      ? {
          ...(openRecord<Settings>(s.secret) ?? {
          baseCurrency: s.base_currency,
          theme: s.theme,
          locale: s.locale ?? fallbackLocale,
          tax: {
            regime: s.tax_regime ?? undefined,
            ratePct: s.tax_rate_pct,
            fixedUAH: s.tax_fixed_uah,
            vatPct: s.tax_vat_pct ?? 0,
            label: s.tax_label ?? "",
          },
          rates: { USD: s.rate_usd, EUR: s.rate_eur },
          ratesMeta: s.rates_meta ?? undefined,
          ratesUpdatedAt: s.rates_updated_at ?? undefined,
          ratesSource: s.rates_source,
          }),
          locale: s.locale ?? fallbackLocale,
        }
      : { locale: fallbackLocale },
  });

  return { state, revision: s?.revision ?? "" };
}

async function upsert(
  client: PoolClient,
  userId: string,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  columns = ["user_id", ...columns];
  rows = rows.map((row) => [userId, ...row]);
  const byKey = new Map<unknown, unknown[]>();
  for (const row of rows) byKey.set(row[1], row);
  const deduped = [...byKey.values()];
  if (deduped.length === 0) return;
  const values: unknown[] = [];
  const tuples = deduped.map(
    (row) => `(${row.map((v) => `$${values.push(v)}`).join(", ")})`,
  );
  const updates = columns
    .slice(2)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT (${columns[0]}, ${columns[1]}) DO UPDATE SET ${updates}`,
    values,
  );
}

const LEGACY_COLUMNS: Record<string, string[]> = {
  categories: ["name", "icon", "color_slot", "kind", "parent_id"],
  recurring_rules: [
    "type", "amount", "currency", "category_id", "note", "account_id",
    "day_of_month", "start_month", "end_month", "last_applied_month",
  ],
  subscriptions: [
    "name", "icon", "price", "currency", "period", "account_id",
    "day_of_month", "start_month", "end_month", "active", "last_applied_month",
  ],
  transactions: [
    "type", "amount", "currency", "category_id", "date", "note", "account_id",
    "to_account_id", "to_amount", "recurring_id", "subscription_id", "breakdown", "tax",
  ],
  savings_accounts: [
    "name", "icon", "kind", "game", "game_name", "game_logo", "bank", "currency",
    "opening_balance", "goal_target", "goal_deadline", "holdings", "priced_at",
  ],
  investments: [
    "name", "kind", "currency", "principal", "annual_rate_pct", "market_value", "coin",
    "fund", "coin_icon", "quantity", "priced_at", "start_date", "end_date",
    "compounding", "compounding_freq", "monthly_contribution", "note",
  ],
  budgets: ["limit_amount", "currency"],
  debts: [
    "name", "icon", "kind", "currency", "balance", "principal",
    "annual_rate_pct", "monthly_payment", "note",
  ],
};

async function upsertSealed<T>(
  client: PoolClient,
  userId: string,
  table: string,
  keyColumn: string,
  keyOf: (item: T) => string,
  items: T[],
): Promise<void> {
  const legacy = LEGACY_COLUMNS[table] ?? [];
  await upsert(
    client,
    userId,
    table,
    [keyColumn, ...legacy, "secret"],
    items.map((item) => [keyOf(item), ...legacy.map(() => null), sealRecord(item)]),
  );
}

async function deleteMissing(
  client: PoolClient,
  userId: string,
  table: string,
  keyColumn: string,
  keys: string[],
): Promise<void> {
  await client.query(
    `DELETE FROM ${table} WHERE user_id = $1 AND ${keyColumn} <> ALL($2::text[])`,
    [userId, keys],
  );
}

export async function saveState(
  userId: string,
  incoming: AppState,
  expectedRevision: string | null = null,
): Promise<string> {
  await ensureSchema();
  const state = normalizeState(incoming);

  return withTransaction(async (client) => {
    if (expectedRevision !== null) {
      const stored = await currentRevision(client, userId);
      if (stored !== "" && stored !== expectedRevision) throw new StateConflictError();
    }

    await upsertSealed(
      client,
      userId,
      "categories",
      "id",
      (c: Category) => c.id,
      state.categories,
    );

    await upsertSealed(
      client,
      userId,
      "recurring_rules",
      "id",
      (r: RecurringRule) => r.id,
      state.recurring,
    );

    await upsertSealed(
      client,
      userId,
      "subscriptions",
      "id",
      (sub: Subscription) => sub.id,
      state.subscriptions,
    );

    await upsertSealed(
      client,
      userId,
      "transactions",
      "id",
      (t: Transaction) => t.id,
      state.transactions,
    );

    await upsertSealed(
      client,
      userId,
      "savings_accounts",
      "id",
      (a: SavingsAccount) => a.id,
      state.savings,
    );

    await upsertSealed(
      client,
      userId,
      "investments",
      "id",
      (i: Investment) => i.id,
      state.investments,
    );

    await upsertSealed(
      client,
      userId,
      "budgets",
      "category_id",
      (b: Budget) => b.categoryId,
      state.budgets,
    );

    await upsertSealed(
      client,
      userId,
      "debts",
      "id",
      (d: Debt) => d.id,
      state.debts,
    );

    await deleteMissing(client, userId, "transactions", "id", state.transactions.map((t) => t.id));
    await deleteMissing(client, userId, "recurring_rules", "id", state.recurring.map((r) => r.id));
    await deleteMissing(client, userId, "subscriptions", "id", state.subscriptions.map((s) => s.id));
    await deleteMissing(client, userId, "savings_accounts", "id", state.savings.map((a) => a.id));
    await deleteMissing(client, userId, "investments", "id", state.investments.map((i) => i.id));
    await deleteMissing(client, userId, "budgets", "category_id", state.budgets.map((b) => b.categoryId));
    await deleteMissing(client, userId, "debts", "id", state.debts.map((d) => d.id));
    await deleteMissing(client, userId, "categories", "id", state.categories.map((c) => c.id));

    const st = state.settings;
    const written = await client.query(
      `INSERT INTO settings (user_id, locale, secret, base_currency, theme, tax_rate_pct, tax_fixed_uah,
                             tax_regime, tax_vat_pct, tax_label, rate_usd, rate_eur, rates_meta,
                             rates_updated_at, rates_source, updated_at)
       VALUES ($1, $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, clock_timestamp())
       ON CONFLICT (user_id) DO UPDATE SET
         locale = EXCLUDED.locale,
         secret = EXCLUDED.secret,
         base_currency = NULL,
         theme = NULL,
         tax_regime = NULL,
         tax_rate_pct = NULL,
         tax_fixed_uah = NULL,
         tax_vat_pct = NULL,
         tax_label = NULL,
         rate_usd = NULL,
         rate_eur = NULL,
         rates_meta = NULL,
         rates_updated_at = NULL,
         rates_source = NULL,
         updated_at = clock_timestamp()
       RETURNING to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision`,
      [userId, st.locale, sealRecord(st)],
    );
    return written.rows[0].revision as string;
  });
}
