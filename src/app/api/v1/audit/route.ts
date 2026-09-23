import { z } from "zod";
import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { prisma } from "@/server/db/client";

/**
 * GET /api/v1/audit — the company's audit trail, newest first.
 *
 * Behind `audit:read`, which only ADMIN holds in the seeded roles. Scoped to
 * the caller's company: the trail is per-tenant.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
});

export const GET = withApi(
  async ({ req, actor }) => {
    const { limit, cursor, entityType, action } = parseQuery(req, querySchema);

    const rows = await prisma.auditLog.findMany({
      where: {
        companyId: actor!.companyId,
        ...(entityType ? { entityType } : {}),
        ...(action ? { action: action as never } : {}),
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return ok(page, { meta: { nextCursor: hasMore ? page[page.length - 1].id : null, limit } });
  },
  { permission: "audit:read" },
);
