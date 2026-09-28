import "server-only";

import { ensureSchema, getPool } from "@/lib/server/db";
import { openRecord, sealRecord } from "@/lib/server/secrets";
import type { Currency } from "@/lib/types";

const API = "https://api.monobank.ua";
const CURRENCY_CODES: Record<number, Currency> = { 980: "UAH", 840: "USD", 978: "EUR" };
/** Monobank allows one personal-API request per minute. */
export const MONO_SPACING_MS = 61_000;
/** A statement request may span at most 31 days and an hour. */
export const MONO_MAX_RANGE_S = 31 * 86_400 + 3_600;

export interface MonoAccount {
  id: string;
  /** Null for a currency the app does not track. */
  currency: Currency | null;
  type: string;
  maskedPan: string;
  /** In the account's currency, major units. */
  balance: number;
}

export interface MonoItem {
  id: string;
  time: number;
  description: string;
  comment?: string;
  mcc: number;
  /** In the account's currency, major units; negative is money out. */
  amount: number;
}

interface MonoStored {
  token: string;
  name?: string;
  accounts?: MonoAccount[];
  fetchedAt?: number;
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

/** How long until this user may call Monobank again, in ms; zero when free. */
export function monoWait(userId: string): number {
  return Math.max(0, (lastCall.get(userId) ?? 0) + MONO_SPACING_MS - Date.now());
}

async function call<T>(userId: string, token: string, path: string): Promise<T> {
  const wait = monoWait(userId);
  if (wait > 0) throw new MonoError(429, `wait:${Math.ceil(wait / 1000)}`);
  lastCall.set(userId, Date.now());
  const res = await fetch(`${API}${path}`, { headers: { "X-Token": token }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 403 || res.status === 401) throw new MonoError(403, "token");
  if (res.status === 429) throw new MonoError(429, "wait:60");
  if (!res.ok) throw new MonoError(502, `monobank:${res.status}`);
  return (await res.json()) as T;
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
}

/** Checks the token against Monobank, then stores it with the account list. The token never leaves the server. */
export async function connectMono(userId: string, token: string): Promise<MonoStored> {
  const info = await call<ClientInfo>(userId, token, "/personal/client-info");
  const stored: MonoStored = {
    token,
    name: info.name,
    accounts: (info.accounts ?? []).map((a) => ({
      id: a.id,
      currency: CURRENCY_CODES[a.currencyCode] ?? null,
      type: a.type ?? "black",
      maskedPan: a.maskedPan?.[0] ?? "",
      balance: a.balance / 100,
    })),
    fetchedAt: Date.now(),
  };
  await ensureSchema();
  await saveMono(userId, stored);
  return stored;
}

/** One account's operations between two moments (unix seconds). */
export async function monoStatement(
  userId: string,
  token: string,
  account: string,
  from: number,
  to: number,
): Promise<MonoItem[]> {
  const items = await call<
    Array<{ id: string; time: number; description?: string; comment?: string; mcc?: number; amount: number }>
  >(userId, token, `/personal/statement/${encodeURIComponent(account)}/${from}/${to}`);
  return items.map((i) => ({
    id: i.id,
    time: i.time,
    description: (i.description ?? "").slice(0, 200),
    comment: i.comment?.slice(0, 200),
    mcc: i.mcc ?? 0,
    amount: i.amount / 100,
  }));
}

/** What the browser may see: everything except the token. */
export function publicMono(stored: MonoStored | null) {
  return stored
    ? { connected: true, name: stored.name ?? "", accounts: stored.accounts ?? [], fetchedAt: stored.fetchedAt ?? null }
    : { connected: false, name: "", accounts: [], fetchedAt: null };
}
