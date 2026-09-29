import "server-only";

import { ensureSchema, getPool, withTransaction } from "@/lib/server/db";
import { hasOlderKeys, resealed } from "@/lib/server/secrets";

const checked = new Set<string>();

export async function resealOlderRecords(userId: string): Promise<number> {
  if (!hasOlderKeys || checked.has(userId)) return 0;
  checked.add(userId);
  try {
    await ensureSchema();
    const tables = await getPool().query<{ table_name: string }>(
      `SELECT s.table_name FROM information_schema.columns s
         JOIN information_schema.columns u
           ON u.table_schema = s.table_schema AND u.table_name = s.table_name AND u.column_name = 'user_id'
        WHERE s.table_schema = current_schema() AND s.column_name = 'secret'`,
    );
    const count = await withTransaction(async (client) => {
      let written = 0;
      for (const { table_name } of tables.rows) {
        const table = `"${table_name.replace(/"/g, '""')}"`;
        const rows = await client.query<{ at: string; secret: string }>(
          `SELECT ctid::text AS at, secret FROM ${table} WHERE user_id = $1 AND secret LIKE 'enc.v1.%' FOR UPDATE`,
          [userId],
        );
        for (const row of rows.rows) {
          const next = resealed(row.secret);
          if (!next) continue;
          await client.query(`UPDATE ${table} SET secret = $2 WHERE ctid = $1::tid`, [row.at, next]);
          written++;
        }
      }
      const user = await client.query<{ profile_secret: string | null; two_factor: string | null }>(
        `SELECT profile_secret, two_factor FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const profile = resealed(user.rows[0]?.profile_secret);
      const twoFactor = resealed(user.rows[0]?.two_factor);
      if (profile || twoFactor) {
        await client.query(
          `UPDATE users SET profile_secret = COALESCE($2, profile_secret), two_factor = COALESCE($3, two_factor) WHERE id = $1`,
          [userId, profile, twoFactor],
        );
        written += (profile ? 1 : 0) + (twoFactor ? 1 : 0);
      }
      return written;
    });
    if (count > 0) console.info(`[secrets] re-sealed ${count} records of one account with the current key`);
    return count;
  } catch (err) {
    checked.delete(userId);
    throw err;
  }
}
