import "server-only";

import { headers } from "next/headers";
import { clientAddress, deviceLabel } from "@/lib/device";
import { makeI18n } from "@/lib/i18n/core";
import { isLocale } from "@/lib/i18n/locales";
import { serverMessages } from "@/lib/i18n/server";
import { ensureSchema, getPool } from "@/lib/server/db";
import { pushTo } from "@/lib/server/push";
import { openRecord, sealRecord } from "@/lib/server/secrets";
import type { Locale } from "@/lib/types";

export type SignInMethod = "password" | "google" | "passkey";

interface SignInRecord {
  method: SignInMethod;
  device: string;
  ip: string;
}

export interface SignInEntry extends SignInRecord {
  id: string;
  at: string;
}

const KEEP = 50;
const FAMILIAR_MS = 180 * 86_400_000;

async function entries(userId: string, limit: number): Promise<SignInEntry[]> {
  const res = await getPool().query<{ id: string; at: string; secret: string }>(
    `SELECT id::text AS id, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, secret
       FROM sign_ins WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT $2`,
    [userId, limit],
  );
  return res.rows.flatMap((row) => {
    const record = openRecord<SignInRecord>(row.secret);
    return record ? [{ id: row.id, at: row.at, ...record }] : [];
  });
}

export async function recentSignIns(userId: string, limit = 10): Promise<SignInEntry[]> {
  await ensureSchema();
  return entries(userId, limit);
}

async function warn(userId: string, record: SignInRecord): Promise<void> {
  const res = await getPool().query<{ locale: string | null }>(`SELECT locale FROM settings WHERE user_id = $1`, [userId]);
  const stored = res.rows[0]?.locale;
  const locale: Locale = isLocale(stored) ? stored : "en";
  const i18n = makeI18n(locale, serverMessages(locale));
  await pushTo(userId, {
    title: i18n.t("push.signin.title"),
    body: [[record.device, record.ip].filter(Boolean).join(" · "), i18n.t("push.signin.body")].join("\n"),
    url: "/profile",
    tag: `sign-in-${Date.now()}`,
  });
}

export async function noteSignIn(userId: string, method: SignInMethod): Promise<string | undefined> {
  try {
    await ensureSchema();
    const h = await headers().catch(() => null);
    const record: SignInRecord = {
      method,
      device: deviceLabel(h?.get("user-agent")),
      ip: clientAddress(h?.get("x-forwarded-for"), h?.get("x-real-ip")).slice(0, 64),
    };
    const earlier = await entries(userId, KEEP);
    const since = Date.now() - FAMILIAR_MS;
    const familiar = earlier.some((e) => e.device === record.device && Date.parse(e.at) >= since);
    const res = await getPool().query<{ id: string }>(
      `INSERT INTO sign_ins (user_id, secret) VALUES ($1, $2) RETURNING id::text AS id`,
      [userId, sealRecord(record)],
    );
    await getPool().query(
      `DELETE FROM sign_ins WHERE user_id = $1 AND id NOT IN (SELECT id FROM sign_ins WHERE user_id = $1 ORDER BY at DESC, id DESC LIMIT $2)`,
      [userId, KEEP],
    );
    if (earlier.length > 0 && !familiar && record.device) void warn(userId, record).catch(() => undefined);
    return res.rows[0]?.id;
  } catch {
    return undefined;
  }
}
