import { withApi, parseBody } from "@/server/api/with-api";
import { created } from "@/server/api/respond";
import { convertPlannedOrders } from "@/server/services/mrp-convert.service";
import { convertBody } from "@/server/validation/mrp";

/**
 * POST /api/v1/mrp/runs/:id/convert — `{ plannedOrderIds }`. Purchases become
 * draft POs grouped by vendor and location; production becomes work orders.
 * All or nothing, and only from the latest completed run. Reading the plan
 * is enough to reach it; the service then requires purchase-order:create or
 * work-order:create for what is converted.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, convertBody);
    return created(await convertPlannedOrders(params.id, input.plannedOrderIds, { actor: actor!, requestId, clientInfo }));
  },
  { permission: "mrp:read" },
);
