/**
 * Where the demo seed may run.
 *
 * The seed creates a demo company and one user per role, all sharing
 * SEED_USER_PASSWORD, and prints that password. In a production database
 * those are working credentials anyone who has read the README can use. So
 * the seed refuses NODE_ENV=production, and any database not on this machine
 * — a laptop pointed at the production URL usually has NODE_ENV unset. A
 * staging seed must say so explicitly with the override.
 */

export const SEED_OVERRIDE = "ANVAYA_ALLOW_DEMO_SEED";
const OVERRIDE_VALUE = "I_UNDERSTAND_THIS_WRITES_DEMO_USERS_AND_PASSWORDS";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Why the seed must not run here, or null when it may. */
export function seedRefusal(env: Record<string, string | undefined>): string | null {
  if (env[SEED_OVERRIDE] === OVERRIDE_VALUE) return null;
  const how = `If this really is a demo or staging database, set ${SEED_OVERRIDE}=${OVERRIDE_VALUE}.`;

  if (env.NODE_ENV === "production") {
    return `Refusing to seed demo users with NODE_ENV=production. ${how}`;
  }
  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    return "Refusing to seed: DATABASE_URL is missing or not a valid connection string.";
  }
  if (!LOCAL_HOSTS.has(host)) {
    return `Refusing to seed demo users into the database at ${host}, which is not on this machine. ${how}`;
  }
  return null;
}
