import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, getPool } from "@/lib/server/db";
import { open, seal } from "@/lib/server/secrets";

export const ATTACHMENT_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
export const ATTACHMENT_MAX_BYTES = 1_500_000;

export async function saveAttachment(userId: string, mime: string, data: Buffer): Promise<string> {
  await ensureSchema();
  const id = randomUUID();
  await getPool().query(`INSERT INTO attachments (user_id, id, mime, secret) VALUES ($1, $2, $3, $4)`, [
    userId,
    id,
    mime,
    seal(data.toString("base64")),
  ]);
  return id;
}

export async function loadAttachment(userId: string, id: string): Promise<{ mime: string; data: Buffer } | null> {
  await ensureSchema();
  const res = await getPool().query(`SELECT mime, secret FROM attachments WHERE user_id = $1 AND id = $2`, [userId, id]);
  const row = res.rows[0];
  if (!row) return null;
  const text = open(row.secret);
  return text ? { mime: row.mime, data: Buffer.from(text, "base64") } : null;
}

export async function pruneAttachments(client: PoolClient, userId: string, referenced: string[]): Promise<void> {
  await client.query(
    `DELETE FROM attachments
      WHERE user_id = $1 AND id <> ALL($2::text[]) AND created_at < now() - interval '1 day'`,
    [userId, referenced],
  );
}
