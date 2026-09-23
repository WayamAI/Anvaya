import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { prisma } from "@/server/db/client";
import { signOutEverywhere } from "@/server/services/auth.service";

/**
 * GET  /api/v1/auth/sessions — the caller's own active sessions.
 * DELETE                     — revoke all of them (sign out everywhere).
 *
 * Scoped to the caller: listing other users' sessions is an administrative
 * act and will sit behind `user:read` when that surface exists.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(async ({ actor }) => {
  const sessions = await prisma.session.findMany({
    where: { userId: actor!.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, lastActivityAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    orderBy: { lastActivityAt: "desc" },
  });

  return ok({
    sessions: sessions.map((s) => ({ ...s, current: s.id === actor!.sessionId })),
  });
});

export const DELETE = withApi(async ({ actor }) => ok(await signOutEverywhere(actor!)));
