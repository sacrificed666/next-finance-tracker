import "server-only";
import { isSealed, keyFromAuthSecret, keyFromSetting, openWith, sealWith } from "@/lib/sealing";

function loadKeys(): { keys: Buffer[]; explicit: boolean } {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim();
  const previous = process.env.DATA_ENCRYPTION_KEY_PREVIOUS?.trim();
  const auth = process.env.AUTH_SECRET?.trim();
  const candidates = [
    configured ? keyFromSetting(configured) : auth ? keyFromAuthSecret(auth) : null,
    previous ? keyFromSetting(previous) : null,
    configured && auth ? keyFromAuthSecret(auth) : null,
  ].filter((key): key is Buffer => key !== null);
  const keys = candidates.filter((key, i) => candidates.findIndex((k) => k.equals(key)) === i);
  return { keys, explicit: Boolean(configured) };
}

const { keys, explicit } = loadKeys();

export const encryptionMode: "key" | "derived" | "off" = keys.length === 0 ? "off" : explicit ? "key" : "derived";

export const hasOlderKeys = keys.length > 1;

if (encryptionMode === "off") {
  console.warn("[secrets] No DATA_ENCRYPTION_KEY or AUTH_SECRET — records are stored unencrypted.");
}

export function seal(plain: string): string {
  return keys.length === 0 ? plain : sealWith(keys[0], plain);
}

export function open(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isSealed(value)) return value;
  if (keys.length === 0) throw new Error("Encrypted records found but no encryption key is configured.");
  const opened = openWith(keys, value);
  if (!opened) throw new Error("A record is sealed with a key this server does not have.");
  return opened.plain;
}

export function resealed(value: string | null | undefined): string | null {
  if (!value || !isSealed(value) || keys.length < 2) return null;
  const opened = openWith(keys, value);
  return opened && opened.keyIndex > 0 ? sealWith(keys[0], opened.plain) : null;
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
