import "server-only";

import { ensureSchema, getPool } from "@/lib/server/db";

const CACHE_MS = 30_000;
const cache = new Map<string, { epoch: number; at: number }>();

export async function sessionEpoch(userId: string): Promise<number> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.epoch;
  await ensureSchema();
  const res = await getPool().query(`SELECT session_epoch FROM users WHERE id = $1`, [userId]);
  const epoch = Number(res.rows[0]?.session_epoch ?? 0);
  cache.set(userId, { epoch, at: Date.now() });
  return epoch;
}

export async function endAllSessions(userId: string): Promise<void> {
  await ensureSchema();
  const res = await getPool().query(
    `UPDATE users SET session_epoch = session_epoch + 1 WHERE id = $1 RETURNING session_epoch`,
    [userId],
  );
  cache.set(userId, { epoch: Number(res.rows[0]?.session_epoch ?? 0), at: Date.now() });
}
