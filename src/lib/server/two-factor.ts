import "server-only";

import { timingSafeEqual } from "node:crypto";
import { ensureSchema, getPool } from "@/lib/server/db";
import { openRecord, sealRecord } from "@/lib/server/secrets";
import { hashRecoveryCode, matchTotp, newRecoveryCodes, newTotpSecret, otpauthUri } from "@/lib/totp";

interface TwoFactorRecord {
  secret?: string;
  pending?: string;
  recovery?: string[];
}

const lastStep = new Map<string, number>();

async function load(userId: string): Promise<TwoFactorRecord> {
  await ensureSchema();
  const res = await getPool().query(`SELECT two_factor FROM users WHERE id = $1`, [userId]);
  return openRecord<TwoFactorRecord>(res.rows[0]?.two_factor) ?? {};
}

async function save(userId: string, record: TwoFactorRecord): Promise<void> {
  const empty = !record.secret && !record.pending;
  await getPool().query(`UPDATE users SET two_factor = $2 WHERE id = $1`, [userId, empty ? null : sealRecord(record)]);
}

function acceptTotp(userId: string, secret: string, code: string): boolean {
  const step = matchTotp(secret, code, Date.now());
  if (step === null || step <= (lastStep.get(userId) ?? -1)) return false;
  lastStep.set(userId, step);
  return true;
}

function recoveryIndex(record: TwoFactorRecord, code: string): number {
  const wanted = Buffer.from(hashRecoveryCode(code));
  return (record.recovery ?? []).findIndex((hash) => {
    const have = Buffer.from(hash);
    return have.length === wanted.length && timingSafeEqual(have, wanted);
  });
}

export async function twoFactorEnabled(userId: string): Promise<boolean> {
  return Boolean((await load(userId)).secret);
}

export async function beginTwoFactor(userId: string, account: string): Promise<{ secret: string; uri: string } | null> {
  const record = await load(userId);
  if (record.secret) return null;
  const pending = newTotpSecret();
  await save(userId, { ...record, pending });
  return { secret: pending, uri: otpauthUri(pending, account) };
}

export async function confirmTwoFactor(userId: string, code: string): Promise<string[] | null> {
  const record = await load(userId);
  if (record.secret || !record.pending || !acceptTotp(userId, record.pending, code)) return null;
  const codes = newRecoveryCodes();
  await save(userId, { secret: record.pending, recovery: codes.map(hashRecoveryCode) });
  return codes;
}

export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const record = await load(userId);
  if (!record.secret) return true;
  if (acceptTotp(userId, record.secret, code)) return true;
  const used = recoveryIndex(record, code);
  if (used < 0) return false;
  await save(userId, { ...record, recovery: record.recovery!.filter((_, i) => i !== used) });
  return true;
}

export async function disableTwoFactor(userId: string, code: string): Promise<boolean> {
  const record = await load(userId);
  if (!record.secret) return true;
  if (!acceptTotp(userId, record.secret, code) && recoveryIndex(record, code) < 0) return false;
  await save(userId, {});
  return true;
}
