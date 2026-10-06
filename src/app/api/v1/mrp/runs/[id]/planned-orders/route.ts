import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { pagePlannedOrders } from "@/server/services/mrp-read.service";
import { plannedOrdersQuery } from "@/server/validation/mrp";

/**
 * GET /api/v1/mrp/runs/:id/planned-orders — `?type=` `?status=` `?materialId=`
 * `?q=` (material code or name); cursor-paged, `?limit=` default 100, max 500.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ req, params, actor }) => {
    const query = parseQuery(req, plannedOrdersQuery);
    const { items, nextCursor, total } = await pagePlannedOrders(actor!.companyId, params.id, query);
    return ok(items, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "mrp:read" },
);
