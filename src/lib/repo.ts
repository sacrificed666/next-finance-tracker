import "server-only";

import type { PoolClient } from "pg";
import { ensureSchema, getPool, withTransaction } from "./db";
import { normalizeState } from "./backup";
import type { AppState } from "./types";

/* ────────────────────────────── loading ────────────────────────────── */

/**
 * A dataset together with the revision it was read at. A save replaces the
 * whole dataset, so a client that writes back a snapshot older than what is
 * stored would silently delete everything recorded since — two open tabs are
 * enough. The revision is `settings.updated_at`, which every save bumps.
 */
export interface StateEnvelope {
  state: AppState;
  /** opaque revision token; "" before anything has ever been written */
  revision: string;
}

/** the stored dataset moved on since the client last read it */
export class StateConflictError extends Error {
  constructor() {
    super(
      "This dataset changed somewhere else — another tab or device saved after you loaded it. Reload to pick up the newer version.",
    );
    this.name = "StateConflictError";
  }
}

async function currentRevision(client: PoolClient): Promise<string> {
  // FOR UPDATE: the check and the write that follows have to be one step, or
  // two saves landing together both read the same revision and both pass
  const res = await client.query(
    `SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision
       FROM settings WHERE id = 1 FOR UPDATE`,
  );
  return res.rows[0]?.revision ?? "";
}

/**
 * Assembles the whole AppState from the normalized tables. An empty database
 * yields an empty state, which `normalizeState` then fills with the default
 * categories and settings.
 */
export async function loadState(): Promise<StateEnvelope> {
  await ensureSchema();
  const pool = getPool();

  const [settings, categories, recurring, subscriptions, transactions, savings, investments, budgets, debts] =
    await Promise.all([
      pool.query(
        `SELECT base_currency, theme, tax_rate_pct, tax_fixed_uah, rate_usd, rate_eur,
                rates_meta, rates_source,
                to_char(rates_updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') AS rates_updated_at,
                to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision
           FROM settings WHERE id = 1`,
      ),
      pool.query(`SELECT id, name, icon, color_slot, kind FROM categories ORDER BY kind, name`),
      pool.query(
        `SELECT id, type, amount, currency, category_id, note, account_id,
                day_of_month, start_month, end_month, last_applied_month
           FROM recurring_rules ORDER BY start_month, id`,
      ),
      pool.query(
        `SELECT id, name, icon, price, currency, period, account_id,
                day_of_month, start_month, end_month, active, last_applied_month
           FROM subscriptions ORDER BY name`,
      ),
      pool.query(
        `SELECT id, type, amount, currency, category_id,
                to_char(date, 'YYYY-MM-DD') AS date,
                note, account_id, to_account_id, to_amount,
                recurring_id, subscription_id, breakdown, tax
           FROM transactions ORDER BY date, id`,
      ),
      pool.query(
        `SELECT id, name, icon, kind, currency, opening_balance, goal_target,
                to_char(goal_deadline, 'YYYY-MM-DD') AS goal_deadline
           FROM savings_accounts ORDER BY name`,
      ),
      pool.query(
        `SELECT id, name, kind, currency, principal, annual_rate_pct, market_value, coin, quantity,
                to_char(priced_at, 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') AS priced_at,
                to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date,
                compounding, compounding_freq, monthly_contribution, note
           FROM investments ORDER BY name`,
      ),
      pool.query(`SELECT category_id, limit_amount, currency FROM budgets`),
      pool.query(
        `SELECT id, name, icon, kind, currency, balance, principal,
                annual_rate_pct, monthly_payment, note
           FROM debts ORDER BY name`,
      ),
    ]);

  const s = settings.rows[0];

  const state = normalizeState({
    version: 1,
    transactions: transactions.rows.map((r) => ({
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
    categories: categories.rows.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      colorSlot: r.color_slot,
      kind: r.kind,
    })),
    recurring: recurring.rows.map((r) => ({
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
    subscriptions: subscriptions.rows.map((r) => ({
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
    savings: savings.rows.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      kind: r.kind,
      currency: r.currency,
      openingBalance: r.opening_balance,
      goal:
        r.goal_target != null
          ? { target: r.goal_target, deadline: r.goal_deadline ?? undefined }
          : undefined,
    })),
    investments: investments.rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      currency: r.currency,
      principal: r.principal,
      annualRatePct: r.annual_rate_pct,
      marketValue: r.market_value ?? undefined,
      coin: r.coin ?? undefined,
      quantity: r.quantity ?? undefined,
      pricedAt: r.priced_at ?? undefined,
      startDate: r.start_date,
      endDate: r.end_date ?? undefined,
      compounding: r.compounding,
      compoundingFreq: r.compounding_freq,
      monthlyContribution: r.monthly_contribution ?? undefined,
      note: r.note ?? undefined,
    })),
    budgets: budgets.rows.map((r) => ({
      categoryId: r.category_id,
      limit: r.limit_amount,
      currency: r.currency,
    })),
    debts: debts.rows.map((r) => ({
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
          baseCurrency: s.base_currency,
          theme: s.theme,
          tax: { ratePct: s.tax_rate_pct, fixedUAH: s.tax_fixed_uah },
          rates: { USD: s.rate_usd, EUR: s.rate_eur },
          ratesMeta: s.rates_meta ?? undefined,
          ratesUpdatedAt: s.rates_updated_at ?? undefined,
          ratesSource: s.rates_source,
        }
      : undefined,
  });

  return { state, revision: s?.revision ?? "" };
}

/* ────────────────────────────── saving ────────────────────────────── */

/** multi-row upsert keyed on the table's first column (its primary key) */
async function upsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  // Postgres refuses an ON CONFLICT batch that touches the same key twice
  // ("cannot affect row a second time") and that error rolls back the whole
  // save, losing every edit in the payload. A repeated key is a client bug,
  // never a reason to drop the dataset on the floor: keep the last row for it,
  // which is the one the client would have won with anyway.
  const byKey = new Map<unknown, unknown[]>();
  for (const row of rows) byKey.set(row[0], row);
  const deduped = [...byKey.values()];
  if (deduped.length === 0) return;
  const values: unknown[] = [];
  const tuples = deduped.map(
    (row) => `(${row.map((v) => `$${values.push(v)}`).join(", ")})`,
  );
  const updates = columns
    .slice(1)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT (${columns[0]}) DO UPDATE SET ${updates}`,
    values,
  );
}

/** removes rows of `table` whose key is absent from `keys` */
async function deleteMissing(
  client: PoolClient,
  table: string,
  keyColumn: string,
  keys: string[],
): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE ${keyColumn} <> ALL($1::text[])`, [keys]);
}

/**
 * Persists the whole state in one transaction: every row is upserted and any
 * row the client no longer has is deleted. Categories are written before their
 * dependants and deleted after them, so referential order always holds.
 *
 * `expectedRevision` is what the client believes it is overwriting. Because the
 * payload is the entire dataset, a stale writer does not merely lose its own
 * edit — it deletes every row added since it loaded. When the caller names a
 * revision that no longer matches, nothing is written and the transaction rolls
 * back. Pass `null` to write unconditionally.
 *
 * Returns the revision the dataset now has.
 */
export async function saveState(
  incoming: AppState,
  expectedRevision: string | null = null,
): Promise<string> {
  await ensureSchema();
  const state = normalizeState(incoming);

  return withTransaction(async (client) => {
    if (expectedRevision !== null) {
      const stored = await currentRevision(client);
      // an empty stored revision means nothing has ever been saved, so there is
      // nothing to be stale against
      if (stored !== "" && stored !== expectedRevision) throw new StateConflictError();
    }

    await upsert(
      client,
      "categories",
      ["id", "name", "icon", "color_slot", "kind"],
      state.categories.map((c) => [c.id, c.name, c.icon, c.colorSlot, c.kind]),
    );

    await upsert(
      client,
      "recurring_rules",
      ["id", "type", "amount", "currency", "category_id", "note", "account_id", "day_of_month", "start_month", "end_month", "last_applied_month"],
      state.recurring.map((r) => [
        r.id, r.type, r.amount, r.currency, r.categoryId, r.note ?? null, r.accountId ?? null,
        r.dayOfMonth, r.startMonth, r.endMonth ?? null, r.lastAppliedMonth ?? null,
      ]),
    );

    await upsert(
      client,
      "subscriptions",
      ["id", "name", "icon", "price", "currency", "period", "account_id", "day_of_month", "start_month", "end_month", "active", "last_applied_month"],
      state.subscriptions.map((s) => [
        s.id, s.name, s.icon, s.price, s.currency, s.period, s.accountId ?? null,
        s.dayOfMonth, s.startMonth, s.endMonth ?? null, s.active, s.lastAppliedMonth ?? null,
      ]),
    );

    await upsert(
      client,
      "transactions",
      ["id", "type", "amount", "currency", "category_id", "date", "note", "account_id", "to_account_id", "to_amount", "recurring_id", "subscription_id", "breakdown", "tax"],
      state.transactions.map((t) => [
        t.id, t.type, t.amount, t.currency, t.categoryId, t.date, t.note ?? null,
        t.accountId ?? null, t.toAccountId ?? null, t.toAmount ?? null,
        t.recurringId ?? null, t.subscriptionId ?? null,
        t.breakdown ? JSON.stringify(t.breakdown) : null,
        t.tax ? JSON.stringify(t.tax) : null,
      ]),
    );

    await upsert(
      client,
      "savings_accounts",
      ["id", "name", "icon", "kind", "currency", "opening_balance", "goal_target", "goal_deadline"],
      state.savings.map((a) => [
        a.id, a.name, a.icon, a.kind, a.currency, a.openingBalance,
        a.goal?.target ?? null, a.goal?.deadline ?? null,
      ]),
    );

    await upsert(
      client,
      "investments",
      ["id", "name", "kind", "currency", "principal", "annual_rate_pct", "market_value", "coin", "quantity", "priced_at", "start_date", "end_date", "compounding", "compounding_freq", "monthly_contribution", "note"],
      state.investments.map((i) => [
        i.id, i.name, i.kind, i.currency, i.principal, i.annualRatePct,
        i.marketValue ?? null, i.coin ?? null, i.quantity ?? null, i.pricedAt ?? null,
        i.startDate, i.endDate ?? null,
        i.compounding, i.compoundingFreq, i.monthlyContribution ?? null, i.note ?? null,
      ]),
    );

    await upsert(
      client,
      "budgets",
      ["category_id", "limit_amount", "currency"],
      state.budgets.map((b) => [b.categoryId, b.limit, b.currency]),
    );

    await upsert(
      client,
      "debts",
      ["id", "name", "icon", "kind", "currency", "balance", "principal", "annual_rate_pct", "monthly_payment", "note"],
      state.debts.map((d) => [
        d.id, d.name, d.icon, d.kind, d.currency, d.balance,
        d.principal ?? null, d.annualRatePct ?? null, d.monthlyPayment ?? null, d.note ?? null,
      ]),
    );

    // drop what the client removed — dependants first, categories last
    await deleteMissing(client, "transactions", "id", state.transactions.map((t) => t.id));
    await deleteMissing(client, "recurring_rules", "id", state.recurring.map((r) => r.id));
    await deleteMissing(client, "subscriptions", "id", state.subscriptions.map((s) => s.id));
    await deleteMissing(client, "savings_accounts", "id", state.savings.map((a) => a.id));
    await deleteMissing(client, "investments", "id", state.investments.map((i) => i.id));
    await deleteMissing(client, "budgets", "category_id", state.budgets.map((b) => b.categoryId));
    await deleteMissing(client, "debts", "id", state.debts.map((d) => d.id));
    await deleteMissing(client, "categories", "id", state.categories.map((c) => c.id));

    const st = state.settings;
    // clock_timestamp(), not now(): now() is the *transaction* start time, so
    // two saves beginning in the same instant would stamp the same revision and
    // the second could no longer be told apart from the first
    const written = await client.query(
      `INSERT INTO settings (id, base_currency, theme, tax_rate_pct, tax_fixed_uah,
                             rate_usd, rate_eur, rates_meta, rates_updated_at, rates_source, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET
         base_currency = EXCLUDED.base_currency,
         theme = EXCLUDED.theme,
         tax_rate_pct = EXCLUDED.tax_rate_pct,
         tax_fixed_uah = EXCLUDED.tax_fixed_uah,
         rate_usd = EXCLUDED.rate_usd,
         rate_eur = EXCLUDED.rate_eur,
         rates_meta = EXCLUDED.rates_meta,
         rates_updated_at = EXCLUDED.rates_updated_at,
         rates_source = EXCLUDED.rates_source,
         updated_at = clock_timestamp()
       RETURNING to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USZ') AS revision`,
      [
        st.baseCurrency,
        st.theme,
        st.tax.ratePct,
        st.tax.fixedUAH,
        st.rates.USD,
        st.rates.EUR,
        st.ratesMeta ? JSON.stringify(st.ratesMeta) : null,
        st.ratesUpdatedAt ?? null,
        st.ratesSource,
      ],
    );
    return written.rows[0].revision as string;
  });
}
