import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";

/**
 * Fixed-window rate limiting, shared across server instances through
 * Postgres. One atomic upsert per check: it either starts a new window or
 * increments the current one, so two instances racing on the same key still
 * count every request.
 *
 * Fails open: if the database cannot answer, the request proceeds (and is
 * logged). Refusing all sign-ins because a counter table is unreachable
 * would turn a limiter into an outage — and the login itself needs the same
 * database anyway.
 */

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  /** Per client address: stops one source spraying many accounts. */
  loginPerIp: { max: 30, windowSeconds: 300 },
  /** Per account: complements the 5-failure lock-out, which only counts failures. */
  loginPerEmail: { max: 10, windowSeconds: 300 },
  passwordChangePerUser: { max: 10, windowSeconds: 900 },
} satisfies Record<string, Limit>;

export async function consume(key: string, limit: Limit): Promise<void> {
  let row: { count: number; windowStart: Date } | undefined;
  try {
    [row] = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "rate_limit_buckets" ("key", "windowStart", "count") VALUES (${key}, NOW(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limit_buckets"."windowStart" <= NOW() - make_interval(secs => ${limit.windowSeconds})
                       THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
        "windowStart" = CASE WHEN "rate_limit_buckets"."windowStart" <= NOW() - make_interval(secs => ${limit.windowSeconds})
                       THEN NOW() ELSE "rate_limit_buckets"."windowStart" END
      RETURNING "count", "windowStart"`;
  } catch (err) {
    logger.error({ err, key }, "rate limit check failed; allowing request");
    return;
  }

  // Occasional housekeeping: old windows are useless once expired.
  if (Math.random() < 0.01) {
    void prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "windowStart" < NOW() - INTERVAL '1 day'`.catch(() => undefined);
  }

  if (row && row.count > limit.max) {
    const retryAfter = Math.max(1, Math.ceil((row.windowStart.getTime() + limit.windowSeconds * 1000 - Date.now()) / 1000));
    throw AppError.rateLimited(`Too many attempts. Try again in ${retryAfter} seconds.`, retryAfter);
  }
}
