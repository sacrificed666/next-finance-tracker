import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { ensureSchema, getPool } from "@/lib/server/db";
import { openRecord, sealRecord } from "@/lib/server/secrets";
import type { Currency } from "@/lib/types";

const API = "https://api.monobank.ua";
const CURRENCY_CODES: Record<number, Currency> = { 980: "UAH", 840: "USD", 978: "EUR" };
export const MONO_SPACING_MS = 61_000;
export const MONO_MAX_RANGE_S = 31 * 86_400 + 3_600;

export interface MonoAccount {
  id: string;
  kind: "card" | "jar";
  currency: Currency | null;
  type: string;
  maskedPan: string;
  title?: string;
  balance: number;
}

export interface MonoItem {
  id: string;
  time: number;
  description: string;
  comment?: string;
  mcc: number;
  amount: number;
  opAmount?: number;
  opCurrency?: Currency;
}

interface MonoStored {
  token: string;
  name?: string;
  accounts?: MonoAccount[];
  fetchedAt?: number;
  webhookKey?: string;
  webhookUrl?: string;
}

const BANK_TIME_ZONE = "Europe/Kyiv";

export function monoDate(unix: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BANK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(unix * 1000),
  );
}

export class MonoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "MonoError";
  }
}

const lastCall = new Map<string, number>();

export function monoWait(userId: string): number {
  return Math.max(0, (lastCall.get(userId) ?? 0) + MONO_SPACING_MS - Date.now());
}

async function call<T>(userId: string, token: string, path: string, body?: unknown): Promise<T> {
  const wait = monoWait(userId);
  if (wait > 0) throw new MonoError(429, `wait:${Math.ceil(wait / 1000)}`);
  lastCall.set(userId, Date.now());
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? { "X-Token": token } : { "X-Token": token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403 || res.status === 401) throw new MonoError(403, "token");
  if (res.status === 429) throw new MonoError(429, "wait:60");
  if (!res.ok) throw new MonoError(502, `monobank:${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function loadMono(userId: string): Promise<MonoStored | null> {
  await ensureSchema();
  const res = await getPool().query(
    `SELECT secret FROM integrations WHERE user_id = $1 AND provider = 'monobank'`,
    [userId],
  );
  return res.rows[0] ? openRecord<MonoStored>(res.rows[0].secret) : null;
}

async function saveMono(userId: string, stored: MonoStored): Promise<void> {
  await getPool().query(
    `INSERT INTO integrations (user_id, provider, secret, updated_at) VALUES ($1, 'monobank', $2, now())
     ON CONFLICT (user_id, provider) DO UPDATE SET secret = EXCLUDED.secret, updated_at = now()`,
    [userId, sealRecord(stored)],
  );
}

export async function deleteMono(userId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM integrations WHERE user_id = $1 AND provider = 'monobank'`, [userId]);
}

interface ClientInfo {
  name?: string;
  accounts?: Array<{ id: string; balance: number; type?: string; currencyCode: number; maskedPan?: string[] }>;
  jars?: Array<{ id: string; title?: string; balance: number; currencyCode: number }>;
}

export async function connectMono(userId: string, token: string): Promise<MonoStored> {
  const info = await call<ClientInfo>(userId, token, "/personal/client-info");
  const stored: MonoStored = {
    token,
    name: info.name,
    accounts: [
      ...(info.accounts ?? []).map((a) => ({
        id: a.id,
        kind: "card" as const,
        currency: CURRENCY_CODES[a.currencyCode] ?? null,
        type: a.type ?? "black",
        maskedPan: a.maskedPan?.[0] ?? "",
        balance: a.balance / 100,
      })),
      ...(info.jars ?? []).map((j) => ({
        id: j.id,
        kind: "jar" as const,
        currency: CURRENCY_CODES[j.currencyCode] ?? null,
        type: "jar",
        maskedPan: "",
        title: j.title?.slice(0, 80),
        balance: j.balance / 100,
      })),
    ],
    fetchedAt: Date.now(),
  };
  await ensureSchema();
  await saveMono(userId, stored);
  return stored;
}

interface RawItem {
  id: string;
  time: number;
  description?: string;
  comment?: string;
  mcc?: number;
  amount: number;
  operationAmount?: number;
  currencyCode?: number;
}

export function parseMonoItem(i: RawItem): MonoItem {
  return {
    id: String(i.id).slice(0, 80),
    time: i.time,
    description: (i.description ?? "").slice(0, 200),
    comment: i.comment?.slice(0, 200),
    mcc: i.mcc ?? 0,
    amount: i.amount / 100,
    opAmount: i.operationAmount !== undefined ? Math.abs(i.operationAmount) / 100 : undefined,
    opCurrency: i.currencyCode !== undefined ? CURRENCY_CODES[i.currencyCode] : undefined,
  };
}

export function isMonoItem(v: unknown): v is RawItem {
  if (typeof v !== "object" || v === null) return false;
  const i = v as Record<string, unknown>;
  return (typeof i.id === "string" || typeof i.id === "number") && Number.isInteger(i.time) && Number.isFinite(i.amount);
}

export async function monoStatement(
  userId: string,
  token: string,
  account: string,
  from: number,
  to: number,
): Promise<MonoItem[]> {
  const items = await call<RawItem[]>(userId, token, `/personal/statement/${encodeURIComponent(account)}/${from}/${to}`);
  return items.map(parseMonoItem);
}

export async function setMonoWebhook(userId: string, origin: string | null): Promise<MonoStored> {
  const stored = await loadMono(userId);
  if (!stored) throw new MonoError(409, "not-connected");
  const webhookKey = stored.webhookKey ?? randomBytes(24).toString("base64url");
  const url = origin ? `${origin.replace(/\/$/, "")}/api/monobank/webhook/${webhookKey}` : "";
  await saveMono(userId, { ...stored, webhookKey });
  await call(userId, stored.token, "/personal/webhook", { webHookUrl: url });
  const next = { ...stored, webhookKey, webhookUrl: url || undefined };
  await saveMono(userId, next);
  return next;
}

export async function findMonoByWebhookKey(key: string): Promise<{ userId: string; stored: MonoStored } | null> {
  if (!/^[\w-]{20,64}$/.test(key)) return null;
  await ensureSchema();
  const res = await getPool().query(`SELECT user_id, secret FROM integrations WHERE provider = 'monobank'`);
  const wanted = Buffer.from(key);
  for (const row of res.rows) {
    const stored = openRecord<MonoStored>(row.secret);
    if (!stored?.webhookKey || !stored.webhookUrl) continue;
    const have = Buffer.from(stored.webhookKey);
    if (have.length === wanted.length && timingSafeEqual(have, wanted)) return { userId: row.user_id as string, stored };
  }
  return null;
}

export function publicMono(stored: MonoStored | null) {
  return stored
    ? {
        connected: true,
        name: stored.name ?? "",
        accounts: stored.accounts ?? [],
        fetchedAt: stored.fetchedAt ?? null,
        webhook: Boolean(stored.webhookUrl),
      }
    : { connected: false, name: "", accounts: [], fetchedAt: null, webhook: false };
}
