import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Server-side Postgres access. A single pool is reused across hot reloads in
 * development by parking it on globalThis — Next re-evaluates modules on every
 * change, which would otherwise leak a pool per edit.
 */
const globalForDb = globalThis as unknown as {
  __financePool?: Pool;
  __financeSchema?: Promise<void>;
};

export function getPool(): Pool {
  if (!globalForDb.__financePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set — the app cannot reach Postgres. Copy .env.example to .env (make env).",
      );
    }
    globalForDb.__financePool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForDb.__financePool;
}

/**
 * Applies db/schema.sql once per process. The schema is idempotent, so this is
 * safe on every boot and keeps a container usable against a volume that was
 * created before the schema existed.
 */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__financeSchema) {
    globalForDb.__financeSchema = (async () => {
      const file = path.join(process.cwd(), "db", "schema.sql");
      const sql = await readFile(file, "utf8");
      await getPool().query(sql);
    })().catch((err) => {
      // let the next request retry instead of caching the failure forever
      globalForDb.__financeSchema = undefined;
      throw err;
    });
  }
  return globalForDb.__financeSchema;
}

/** runs `fn` inside a transaction, rolling back on any error */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
