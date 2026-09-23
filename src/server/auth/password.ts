import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing.
 *
 * argon2id, which is the algorithm OWASP recommends for new applications: it
 * resists both GPU cracking and side-channel attacks, where bcrypt resists
 * only the former and also silently truncates input beyond 72 bytes.
 *
 * Parameters follow the OWASP minimum of 19 MiB memory with two iterations.
 * They are named here rather than left to library defaults so a future
 * upgrade is a visible change to this file rather than a silent change in a
 * dependency.
 */
const PARAMS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, PARAMS);
}

/**
 * Verify a password against a stored hash.
 *
 * Never throws on a malformed or empty hash — a corrupt row must read as
 * "wrong password", not as a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, plain, PARAMS);
  } catch {
    return false;
  }
}

/**
 * A real hash to verify against when the account does not exist.
 *
 * Without this, a login for an unknown email returns immediately while a real
 * account spends ~50ms hashing, and that difference alone enumerates valid
 * users. It must be a genuine argon2 hash: a hand-written placeholder fails
 * to parse in microseconds and so leaks the same timing it was meant to hide.
 *
 * Generated once on first use and cached, so the cost is paid at most once
 * per process rather than on every failed login.
 */
let dummyHash: Promise<string> | null = null;

export function getDummyHash(): Promise<string> {
  dummyHash ??= hash("anvaya-nonexistent-account-placeholder", PARAMS);
  return dummyHash;
}

/**
 * Verify against a real user's hash, or against the placeholder when there is
 * no such user, so both outcomes take comparable time.
 */
export async function verifyOrDummy(plain: string, storedHash: string | null): Promise<boolean> {
  if (storedHash) return verifyPassword(plain, storedHash);
  await verifyPassword(plain, await getDummyHash());
  return false;
}
