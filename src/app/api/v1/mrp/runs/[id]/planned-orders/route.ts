import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listPlannedOrders } from "@/server/services/mrp-read.service";
import { plannedOrdersQuery } from "@/server/validation/mrp";

/** GET /api/v1/mrp/runs/:id/planned-orders — `?type=` `?status=` `?materialId=`. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ req, params, actor }) => ok(await listPlannedOrders(actor!.companyId, params.id, parseQuery(req, plannedOrdersQuery))),
  { permission: "mrp:read" },
);
