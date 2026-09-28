import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>;

const KEYLEN = 64;
const CURRENT: ScryptParams = { N: 1 << 17, r: 8, p: 1 };
const LEGACY: ScryptParams = { N: 1 << 14, r: 8, p: 1 };

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return scrypt(password, salt, KEYLEN, { ...params, maxmem: 512 * 1024 * 1024 });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, CURRENT);
  return `scrypt2$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  const [scheme] = parts;
  let params = LEGACY;
  let saltHex: string | undefined;
  let hashHex: string | undefined;

  if (scheme === "scrypt2") {
    const [, n, r, p, salt, hash] = parts;
    params = { N: Number(n), r: Number(r), p: Number(p) };
    saltHex = salt;
    hashHex = hash;
  } else if (scheme === "scrypt") {
    [, saltHex, hashHex] = parts;
  } else {
    return false;
  }

  if (!saltHex || !hashHex) return false;
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEYLEN) return false;
  const actual = await derive(password, Buffer.from(saltHex, "hex"), params);
  return timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt2$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$`);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That is longer than 200 characters.";
  return null;
}
