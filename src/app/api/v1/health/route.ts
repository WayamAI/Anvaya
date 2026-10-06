import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { checkDatabase } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";

/**
 * Liveness + readiness probe.
 *
 * Reports the database round-trip rather than only that the process is up, so
 * a deploy check fails when the app cannot actually serve requests.
 */

// Always evaluated at request time — a cached health check reports nothing.
export const dynamic = "force-dynamic";

export const GET = withApi(async ({ log }) => {
  let database: { ok: boolean; latencyMs: number | null };

  try {
    database = await checkDatabase();
  } catch (error) {
    // Public endpoint: the driver's message can name hosts, users and ports,
    // so it goes to the log and the caller gets a bare 503.
    log.error({ err: error }, "health check: database unreachable");
    throw AppError.unavailable();
  }

  return ok({
    status: "ok" as const,
    version: process.env.npm_package_version ?? "0.0.0",
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database },
  });
  // Public: a health probe runs before anyone can sign in, and a load
  // balancer has no credentials to offer.
}, { auth: false });
