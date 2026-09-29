import "server-only";

import type { PoolClient } from "pg";
import { ensureSchema, getPool, withTransaction } from "@/lib/server/db";
import { normalizeState } from "@/lib/state/backup";
import {
  applyChanges,
  COLLECTION_NAMES,
  keyOf,
  stableJson,
  type CollectionName,
  type ItemOf,
  type StateChanges,
} from "@/lib/state/changes";
import { pruneAttachments } from "@/lib/server/attachments";
import { openRecord, sealRecord } from "@/lib/server/secrets";
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
} from "@/lib/types";

export interface StateEnvelope {
  state: AppState;
  revision: string;
}

type Queryable = { query: PoolClient["query"] };

async function currentRevision(client: PoolClient, userId: string): Promise<string> {
  const res = await client.query(
    `SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision
       FROM settings WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  return res.rows[0]?.revision ?? "";
}

export async function stateRevision(userId: string): Promise<string> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision FROM settings WHERE user_id = $1`,
    [userId],
  );
  return res.rows[0]?.revision ?? "";
}

export const UNCLAIMED_USER_ID = "00000000-0000-0000-0000-000000000000";

const claimed = new Set<string>();

export async function claimOrphanData(userId: string): Promise<number> {
  if (userId === UNCLAIMED_USER_ID || claimed.has(userId)) return 0;
  claimed.add(userId);
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
  return loadStateWith(getPool(), userId, fallbackLocale);
}

async function loadStateWith(
  pool: Queryable,
  userId: string,
  fallbackLocale: Locale,
): Promise<StateEnvelope> {

  const sealedRows = (table: string) => pool.query(`SELECT secret FROM ${table} WHERE user_id = $1`, [userId]);
  const [rules, receivables, wishlist, plannedEvents, snapshots] = await Promise.all(
    SEALED_TABLES.map((table) => sealedRows(table)),
  );
  const opened = (res: { rows: Array<{ secret: string | null }> }) =>
    res.rows.map((r) => openRecord<unknown>(r.secret)).filter((v) => v !== null);

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
    rules: opened(rules),
    receivables: opened(receivables),
    wishlist: opened(wishlist),
    plannedEvents: opened(plannedEvents),
    snapshots: opened(snapshots),
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

const SEALED_TABLES = ["category_rules", "receivables", "wishlist_items", "planned_events", "net_worth_snapshots"] as const;

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

const TABLES: { [K in CollectionName]: { table: string; key: string } } = {
  transactions: { table: "transactions", key: "id" },
  categories: { table: "categories", key: "id" },
  recurring: { table: "recurring_rules", key: "id" },
  subscriptions: { table: "subscriptions", key: "id" },
  savings: { table: "savings_accounts", key: "id" },
  investments: { table: "investments", key: "id" },
  budgets: { table: "budgets", key: "category_id" },
  debts: { table: "debts", key: "id" },
  rules: { table: "category_rules", key: "id" },
  receivables: { table: "receivables", key: "id" },
  wishlist: { table: "wishlist_items", key: "id" },
  plannedEvents: { table: "planned_events", key: "id" },
  snapshots: { table: "net_worth_snapshots", key: "id" },
};

async function hasUnsealedRows(client: PoolClient, userId: string): Promise<boolean> {
  const tables = [...new Set(Object.values(TABLES).map((t) => t.table))];
  const res = await client.query(
    `SELECT ${tables.map((t) => `EXISTS (SELECT 1 FROM ${t} WHERE user_id = $1 AND secret IS NULL)`).join(" OR ")} AS unsealed`,
    [userId],
  );
  return res.rows[0]?.unsealed === true;
}

async function writeDifferences(
  client: PoolClient,
  userId: string,
  before: AppState,
  after: AppState,
  everything: boolean,
): Promise<number> {
  let touched = 0;
  for (const name of COLLECTION_NAMES) {
    const { table, key } = TABLES[name];
    const k = (item: ItemOf<typeof name>) => keyOf(name, item);
    const previous = new Map((before[name] as ItemOf<typeof name>[]).map((item) => [k(item), stableJson(item)]));
    const items = after[name] as ItemOf<typeof name>[];
    const changed = everything ? items : items.filter((item) => previous.get(k(item)) !== stableJson(item));
    const kept = new Set(items.map(k));
    const removed = [...previous.keys()].filter((id) => !kept.has(id));
    if (changed.length > 0) await upsertSealed(client, userId, table, key, k, changed);
    if (removed.length > 0) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1 AND ${key} = ANY($2::text[])`, [userId, removed]);
    }
    touched += changed.length + removed.length;
  }
  return touched;
}

export interface SaveResult {
  revision: string;
  stale: boolean;
  written: number;
}

export async function saveChanges(
  userId: string,
  changes: StateChanges,
  baseRevision: string | null,
  fallbackLocale: Locale = "en",
): Promise<SaveResult> {
  await ensureSchema();
  return withTransaction(async (client) => {
    const stored = await currentRevision(client, userId);
    const { state: current } = await loadStateWith(client, userId, fallbackLocale);
    const merged = normalizeState(applyChanges(current, changes));
    const reseal = stored !== "" && (await hasUnsealedRows(client, userId));

    let written = await writeDifferences(client, userId, current, merged, reseal);
    const settingsChanged = stableJson(current.settings) !== stableJson(merged.settings);
    const stale = baseRevision !== null && stored !== "" && baseRevision !== stored;

    if (written === 0 && !settingsChanged && stored !== "") {
      return { revision: stored, stale, written };
    }
    if (merged.transactions !== current.transactions) {
      await pruneAttachments(client, userId, merged.transactions.flatMap((tx) => tx.attachmentIds ?? []));
    }

    const st = merged.settings;
    const res = await client.query(
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
    written += 1;
    return { revision: res.rows[0].revision as string, stale, written };
  });
}
