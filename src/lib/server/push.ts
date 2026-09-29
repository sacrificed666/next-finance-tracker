import "server-only";

import { createHash } from "node:crypto";
import { OWNER_EMAIL } from "@/lib/server/auth-config";
import { ensureSchema, getPool } from "@/lib/server/db";
import { loadState } from "@/lib/server/repo";
import { openRecord, sealRecord } from "@/lib/server/secrets";
import { dueReminders, reminderMessage, type PushMessage } from "@/lib/finance/reminders";
import { makeI18n, type I18n } from "@/lib/i18n/core";
import { serverMessages } from "@/lib/i18n/server";
import type { Locale } from "@/lib/types";
import { base64url, isSubscription, sendPush, vapidFromSeed, type PushSubscriptionKeys, type VapidKeys } from "@/lib/web-push";

const seed = process.env.DATA_ENCRYPTION_KEY?.trim() || process.env.AUTH_SECRET?.trim();
const vapid: VapidKeys | null = seed ? vapidFromSeed(createHash("sha256").update(`finance-tracker:vapid:${seed}`).digest()) : null;

const subject =
  process.env.VAPID_SUBJECT?.trim() ||
  (OWNER_EMAIL ? `mailto:${OWNER_EMAIL}` : process.env.AUTH_URL?.startsWith("https://") ? process.env.AUTH_URL : "mailto:owner@example.com");

export const REMINDER_HOUR = Math.min(23, Math.max(0, Number(process.env.REMINDER_HOUR ?? 9) || 0));
const TIME_ZONE = process.env.TZ?.trim() || "Europe/Kyiv";

const deviceId = (endpoint: string) => createHash("sha256").update(endpoint).digest("base64url").slice(0, 32);

export function pushKey(): string | null {
  return vapid ? base64url(vapid.publicKey) : null;
}

export async function saveDevice(userId: string, subscription: unknown): Promise<boolean> {
  if (!isSubscription(subscription)) return false;
  await ensureSchema();
  const record: PushSubscriptionKeys = { endpoint: subscription.endpoint, keys: subscription.keys };
  await getPool().query(
    `INSERT INTO push_subscriptions (user_id, id, secret) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, id) DO UPDATE SET secret = EXCLUDED.secret`,
    [userId, deviceId(record.endpoint), sealRecord(record)],
  );
  return true;
}

export async function removeDevice(userId: string, endpoint: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND id = $2`, [userId, deviceId(endpoint)]);
}

async function devices(userId: string): Promise<Array<{ id: string; subscription: PushSubscriptionKeys }>> {
  await ensureSchema();
  const res = await getPool().query<{ id: string; secret: string }>(`SELECT id, secret FROM push_subscriptions WHERE user_id = $1`, [userId]);
  return res.rows
    .map((row) => ({ id: row.id, subscription: openRecord<PushSubscriptionKeys>(row.secret) }))
    .filter((d): d is { id: string; subscription: PushSubscriptionKeys } => isSubscription(d.subscription));
}

export async function pushTo(userId: string, message: PushMessage, endpoint?: string): Promise<{ sent: number; failed: number }> {
  if (!vapid) return { sent: 0, failed: 0 };
  const targets = (await devices(userId)).filter((d) => !endpoint || d.subscription.endpoint === endpoint);
  let sent = 0;
  let failed = 0;
  for (const device of targets) {
    const result = await sendPush(device.subscription, message, vapid, subject);
    if (result === "sent") sent++;
    else failed++;
    if (result === "gone") {
      await getPool().query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND id = $2`, [userId, device.id]);
    }
  }
  return { sent, failed };
}

const i18nFor = (locale: Locale): I18n => makeI18n(locale, serverMessages(locale));

export async function testMessage(userId: string): Promise<PushMessage> {
  const { state } = await loadState(userId);
  const i18n = i18nFor(state.settings.locale);
  return { title: i18n.t("push.test.title"), body: i18n.t("push.test.body", { hour: String(REMINDER_HOUR) }), url: "/settings", tag: "test" };
}

function localNow(now: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export async function sendDigests(now = new Date()): Promise<{ checked: number; sent: number }> {
  if (!vapid) return { checked: 0, sent: 0 };
  const { date, hour } = localNow(now);
  if (hour < REMINDER_HOUR) return { checked: 0, sent: 0 };
  await ensureSchema();
  const due = await getPool().query<{ id: string }>(
    `UPDATE users SET reminded_on = $1::date
      WHERE (reminded_on IS NULL OR reminded_on < $1::date)
        AND id IN (SELECT DISTINCT user_id FROM push_subscriptions)
      RETURNING id`,
    [date],
  );
  let sent = 0;
  for (const { id } of due.rows) {
    try {
      const { state } = await loadState(id);
      const i18n = i18nFor(state.settings.locale);
      const message = reminderMessage(dueReminders(state, date, i18n), date, i18n);
      if (message) sent += (await pushTo(id, message)).sent;
    } catch (err) {
      console.error("[push] digest failed", err);
    }
  }
  return { checked: due.rowCount ?? 0, sent };
}
