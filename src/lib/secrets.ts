import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc.v1.";
const IV_BYTES = 12;

function loadKey(): { key: Buffer; explicit: boolean } | null {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (configured) {
    const raw = Buffer.from(configured, "base64");
    if (raw.length === 32) return { key: raw, explicit: true };
    return { key: createHash("sha256").update(configured).digest(), explicit: true };
  }
  const fallback = process.env.AUTH_SECRET?.trim();
  if (fallback) {
    return { key: createHash("sha256").update(`finance-tracker:data:${fallback}`).digest(), explicit: false };
  }
  return null;
}

const loaded = loadKey();

export const encryptionMode: "key" | "derived" | "off" = loaded
  ? loaded.explicit
    ? "key"
    : "derived"
  : "off";

if (encryptionMode === "off") {
  console.warn("[secrets] No DATA_ENCRYPTION_KEY or AUTH_SECRET — records are stored unencrypted.");
}

export function seal(plain: string): string {
  if (!loaded) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", loaded.key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString("base64");
}

export function open(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!value.startsWith(PREFIX)) return value;
  if (!loaded) throw new Error("Encrypted records found but no encryption key is configured.");
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const body = raw.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv("aes-256-gcm", loaded.key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function sealRecord(value: unknown): string {
  return seal(JSON.stringify(value));
}

export function openRecord<T>(value: string | null | undefined): T | null {
  const text = open(value);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
