import { describe, expect, it } from "vitest";
import { isSealed, keyFromAuthSecret, keyFromSetting, openWith, sealWith } from "./sealing";

const current = keyFromSetting(Buffer.alloc(32, 7).toString("base64"));
const derived = keyFromAuthSecret("auth-secret");
const other = keyFromSetting("some passphrase");

describe("sealing", () => {
  it("reads a base64 key of 32 bytes as it is, and hashes anything else", () => {
    expect(current.equals(Buffer.alloc(32, 7))).toBe(true);
    expect(other.length).toBe(32);
    expect(keyFromSetting("some passphrase").equals(other)).toBe(true);
  });

  it("opens with the key that sealed, and says which one it was", () => {
    const sealed = sealWith(derived, "{\"amount\":420}");
    expect(isSealed(sealed)).toBe(true);
    expect(openWith([current, derived], sealed)).toEqual({ plain: "{\"amount\":420}", keyIndex: 1 });
    expect(openWith([derived], sealed)?.keyIndex).toBe(0);
  });

  it("gives nothing back for a key that did not seal it", () => {
    expect(openWith([current, other], sealWith(derived, "x"))).toBeNull();
  });

  it("never seals the same text the same way twice", () => {
    expect(sealWith(current, "same")).not.toBe(sealWith(current, "same"));
  });
});
