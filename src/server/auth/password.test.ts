import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, verifyOrDummy, getDummyHash } from "./password";

describe("password hashing", () => {
  it("produces an argon2id hash, never the plaintext", async () => {
    const h = await hashPassword("Anvaya!Demo2026");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(h).not.toContain("Anvaya!Demo2026");
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("SamePassword123"), hashPassword("SamePassword123")]);
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const h = await hashPassword("CorrectHorse123");
    await expect(verifyPassword("CorrectHorse123", h)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const h = await hashPassword("CorrectHorse123");
    await expect(verifyPassword("correcthorse123", h)).resolves.toBe(false);
    await expect(verifyPassword("", h)).resolves.toBe(false);
  });

  it("treats a corrupt or empty hash as a failed login, not an error", async () => {
    // A damaged row must read as "wrong password". Throwing would surface as
    // a 500, which tells an attacker the account exists.
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "$argon2id$garbage")).resolves.toBe(false);
  });

  it("uses a real parseable hash for the unknown-account path", async () => {
    // A hand-written placeholder would fail to parse in microseconds and leak
    // the timing difference it exists to hide.
    const dummy = await getDummyHash();
    expect(dummy).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword("whatever", dummy)).resolves.toBe(false);
  });

  it("still hashes when there is no stored hash, and reports failure", async () => {
    await expect(verifyOrDummy("whatever", null)).resolves.toBe(false);
  });

  it("verifyOrDummy accepts a correct password against a real hash", async () => {
    const h = await hashPassword("RealPassword123");
    await expect(verifyOrDummy("RealPassword123", h)).resolves.toBe(true);
  });

  it("does the same amount of work for a missing account as a wrong password", async () => {
    const h = await hashPassword("RealPassword123");
    await getDummyHash(); // warm the cache so it is not timed

    const time = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };

    const known = await time(() => verifyOrDummy("wrong-password", h));
    const unknown = await time(() => verifyOrDummy("wrong-password", null));

    // Both must actually hash. A generous bound: the point is that the
    // unknown path is not returning in ~0ms, not that they match exactly.
    expect(unknown).toBeGreaterThan(known * 0.25);
  });
});
