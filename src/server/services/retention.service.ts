import { prisma } from "@/server/db/client";
import { logger } from "@/server/logger";

/**
 * Housekeeping for tables that would otherwise only grow.
 *
 *  sessions          Deleted 30 days after they ended — expired or revoked —
 *                    so "where was I signed in" stays answerable for a month.
 *                    An active session is never touched: it is neither
 *                    revoked nor past its expiry, and an expired session can
 *                    never be revived (resolveSession refuses it).
 *  idempotency keys  Kept 7 days. A key is minted when a form opens and
 *                    retried within seconds or minutes of the first attempt;
 *                    a week is far beyond any retry that replay protection
 *                    exists for.
 *
 * Rate-limit windows are not here: rate-limit.ts already clears windows over
 * a day old as it goes.
 * Every delete is by age alone, so running it twice, or from two servers at
 * once, is harmless. It runs now and then after a sign-in, and on demand
 * with `npm run maintenance:purge`.
 */

export const RETENTION = {
  endedSessionDays: 30,
  idempotencyKeyDays: 7,
} as const;

const DAY_MS = 86_400_000;

export async function purgeExpiredRecords(now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const sessionCutoff = ago(RETENTION.endedSessionDays);

  const [sessions, idempotencyKeys] = await Promise.all([
    prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] } }),
    prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: ago(RETENTION.idempotencyKeyDays) } } }),
  ]);
  const purged = { sessions: sessions.count, idempotencyKeys: idempotencyKeys.count };
  logger.info(purged, "retention: purged expired records");
  return purged;
}

/** Now and then, without holding up the caller; a failure is only logged. */
export function maybePurgeExpiredRecords(probability = 0.01) {
  if (Math.random() >= probability) return;
  void purgeExpiredRecords().catch((err) => logger.error({ err }, "retention: purge failed"));
}
