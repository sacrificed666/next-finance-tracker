import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

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

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__financeSchema) {
    globalForDb.__financeSchema = (async () => {
      const file = path.join(process.cwd(), "db", "schema.sql");
      const sql = await readFile(file, "utf8");
      await getPool().query(sql);
    })().catch((err) => {
      globalForDb.__financeSchema = undefined;
      throw err;
    });
  }
  return globalForDb.__financeSchema;
}

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
