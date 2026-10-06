import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { pageExceptions } from "@/server/services/mrp-read.service";
import { exceptionsQuery } from "@/server/validation/mrp";

/**
 * GET /api/v1/mrp/runs/:id/exceptions — open first, then by severity and due
 * date; cursor-paged, `?limit=` default 100, max 500.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ req, params, actor }) => {
    const query = parseQuery(req, exceptionsQuery);
    const { items, nextCursor, total } = await pageExceptions(actor!.companyId, params.id, query);
    return ok(items, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "mrp:read" },
);
