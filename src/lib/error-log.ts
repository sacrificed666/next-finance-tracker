import { Pool } from "pg";

const KEEP = 200;
const shared = globalThis as { __financePool?: Pool; __financeErrorPool?: Pool };

function pool(): Pool | null {
  if (shared.__financePool) return shared.__financePool;
  if (!process.env.DATABASE_URL) return null;
  shared.__financeErrorPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return shared.__financeErrorPool;
}

export function errorText(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function logError(route: string, err: unknown, digest?: string): Promise<void> {
  console.error(`[${route}]`, err);
  const db = pool();
  if (!db) return;
  try {
    await db.query(`INSERT INTO app_errors (route, message, digest) VALUES ($1, $2, $3)`, [route.slice(0, 200), errorText(err), digest ?? null]);
    await db.query(`DELETE FROM app_errors WHERE id <= (SELECT id FROM app_errors ORDER BY id DESC OFFSET $1 LIMIT 1)`, [KEEP]);
  } catch {
    return;
  }
}
