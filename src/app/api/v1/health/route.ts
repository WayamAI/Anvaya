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

export const GET = withApi(async () => {
  let database: { ok: boolean; latencyMs: number | null; error?: string };

  try {
    database = { ...(await checkDatabase()), error: undefined };
  } catch (error) {
    throw AppError.internal(
      `Database is unreachable: ${(error as Error).message}`,
      error,
    );
  }

  return ok({
    status: "ok" as const,
    version: process.env.npm_package_version ?? "0.0.0",
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database },
  });
});
