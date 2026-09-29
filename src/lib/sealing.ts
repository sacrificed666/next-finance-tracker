import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SEALED_PREFIX = "enc.v1.";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function keyFromSetting(value: string): Buffer {
  const raw = Buffer.from(value, "base64");
  return raw.length === 32 ? raw : createHash("sha256").update(value).digest();
}

export function keyFromAuthSecret(secret: string): Buffer {
  return createHash("sha256").update(`finance-tracker:data:${secret}`).digest();
}

export function isSealed(value: string): boolean {
  return value.startsWith(SEALED_PREFIX);
}

export function sealWith(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return SEALED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function openWithKey(key: Buffer, raw: Buffer): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function openWith(keys: Buffer[], value: string): { plain: string; keyIndex: number } | null {
  const raw = Buffer.from(value.slice(SEALED_PREFIX.length), "base64");
  for (let i = 0; i < keys.length; i++) {
    const plain = openWithKey(keys[i], raw);
    if (plain !== null) return { plain, keyIndex: i };
  }
  return null;
}
