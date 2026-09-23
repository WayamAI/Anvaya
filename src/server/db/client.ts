import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, isProduction, isTest } from "@/server/config/env";
import { logger } from "@/server/logger";

/**
 * The Prisma client singleton.
 *
 * Next's dev server reloads modules on every edit. Without caching the client
 * on `globalThis`, each reload would open a fresh connection pool and the
 * database would refuse connections within a few minutes of editing. In
 * production the module is evaluated once, so the cache is not used.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  /*
    Prisma 7 talks to Postgres through a driver adapter, which means the pool
    is ours to size. Defaults are tuned for a single Next server: enough
    connections to serve concurrent requests, an idle timeout so they are
    released between bursts, and a short connection timeout so an unreachable
    database fails fast instead of hanging a request.
  */
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: isTest ? 5 : 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Long-running MRP transactions still need a ceiling; without one a stuck
    // statement holds its connection until the server restarts.
    statement_timeout: 60_000,
  });

  const client = new PrismaClient({
    adapter,
    // Surfaced through our own logger so query logs match the app's format
    // and respect LOG_LEVEL.
    log: isProduction
      ? [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }]
      : [
          { emit: "event", level: "query" },
          { emit: "event", level: "error" },
          { emit: "event", level: "warn" },
        ],
  });

  client.$on("error", (e) => logger.error({ target: e.target }, e.message));
  client.$on("warn", (e) => logger.warn({ target: e.target }, e.message));

  if (!isProduction) {
    client.$on("query", (e) => {
      // Slow queries are the ones worth seeing; everything else is noise at
      // debug level. The threshold is deliberately low so an accidental N+1
      // shows up as a burst during development.
      const level = e.duration >= 200 ? "warn" : "debug";
      logger[level]({ durationMs: e.duration, params: e.params }, e.query);
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (!isProduction) globalForPrisma.prisma = prisma;

/** Round-trip check used by the health endpoint. */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const started = performance.now();
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true, latencyMs: Math.round(performance.now() - started) };
}
