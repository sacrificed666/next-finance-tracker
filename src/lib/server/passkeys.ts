import "server-only";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { ensureSchema, getPool } from "@/lib/server/db";
import { openRecord, sealRecord } from "@/lib/server/secrets";

interface StoredPasskey {
  publicKey: string;
  counter: number;
  transports?: string[];
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

type Purpose = "register" | "login";

const CHALLENGE_MS = 5 * 60_000;
const challenges = new Map<string, { purpose: Purpose; userId: string | null; expires: number }>();

function relyingParty(): { id: string; origin: string } {
  const url = new URL(process.env.AUTH_URL?.trim() || "http://localhost:3000");
  return { id: url.hostname, origin: url.origin };
}

function remember(challenge: string, purpose: Purpose, userId: string | null) {
  const now = Date.now();
  for (const [key, value] of challenges) if (value.expires < now) challenges.delete(key);
  challenges.set(challenge, { purpose, userId, expires: now + CHALLENGE_MS });
}

function redeem(challenge: string, purpose: Purpose, userId: string | null): boolean {
  const found = challenges.get(challenge);
  challenges.delete(challenge);
  return Boolean(found && found.purpose === purpose && found.userId === userId && found.expires >= Date.now());
}

async function rows(userId: string): Promise<Array<{ id: string; record: StoredPasskey }>> {
  await ensureSchema();
  const res = await getPool().query<{ id: string; secret: string }>(
    `SELECT id, secret FROM passkeys WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return res.rows
    .map((r) => ({ id: r.id, record: openRecord<StoredPasskey>(r.secret) }))
    .filter((r): r is { id: string; record: StoredPasskey } => r.record !== null);
}

export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
  return (await rows(userId)).map(({ id, record }) => ({
    id,
    name: record.name,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt ?? null,
  }));
}

export async function registrationOptions(userId: string, email: string, displayName: string) {
  const existing = await rows(userId);
  const rp = relyingParty();
  const options = await generateRegistrationOptions({
    rpName: "Finances",
    rpID: rp.id,
    userName: email,
    userDisplayName: displayName || email,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map(({ id, record }) => ({ id, transports: record.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  remember(options.challenge, "register", userId);
  return options;
}

export async function finishRegistration(userId: string, response: RegistrationResponseJSON, name: string): Promise<boolean> {
  const rp = relyingParty();
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: (challenge) => redeem(challenge, "register", userId),
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
  }).catch(() => null);
  if (!result?.verified) return false;
  const { credential } = result.registrationInfo;
  const record: StoredPasskey = {
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports,
    name: name.slice(0, 60) || "Passkey",
    createdAt: new Date().toISOString(),
  };
  await getPool().query(`INSERT INTO passkeys (id, user_id, secret) VALUES ($1, $2, $3)`, [credential.id, userId, sealRecord(record)]);
  return true;
}

export async function removePasskey(userId: string, id: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM passkeys WHERE user_id = $1 AND id = $2`, [userId, id]);
}

export async function loginOptions() {
  const rp = relyingParty();
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: "preferred" });
  remember(options.challenge, "login", null);
  return options;
}

export async function verifyPasskeyLogin(
  response: AuthenticationResponseJSON,
): Promise<{ id: string; email: string | null; name: string | null; image: string | null } | null> {
  if (typeof response?.id !== "string") return null;
  await ensureSchema();
  const found = await getPool().query<{ user_id: string; secret: string; email: string | null; name: string | null; image: string | null }>(
    `SELECT p.user_id, p.secret, u.email, u.name, u.image FROM passkeys p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [response.id],
  );
  const row = found.rows[0];
  const record = row ? openRecord<StoredPasskey>(row.secret) : null;
  if (!row || !record) return null;
  const rp = relyingParty();
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: (challenge) => redeem(challenge, "login", null),
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: response.id,
      publicKey: new Uint8Array(Buffer.from(record.publicKey, "base64url")),
      counter: record.counter,
      transports: record.transports,
    },
    requireUserVerification: false,
  }).catch(() => null);
  if (!result?.verified) return null;
  await getPool().query(`UPDATE passkeys SET secret = $2 WHERE id = $1`, [
    response.id,
    sealRecord({ ...record, counter: result.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() }),
  ]);
  return { id: row.user_id, email: row.email, name: row.name, image: row.image };
}
