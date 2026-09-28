import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";
import { updateWorkOrder } from "@/server/services/work-order-write.service";
import { updateWorkOrderBody } from "@/server/validation/production";

/**
 * GET   /api/v1/work-orders/:id — operations, components with their lots and
 *       material readiness at the order's location, and the lots it produced.
 * PATCH — re-plan a PLANNED or FIRMED order. A new quantity or start date
 *       re-takes the component snapshot from the pinned BOM version.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getWorkOrder(actor!.companyId, params.id)),
  { permission: "work-order:read" },
);

export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, updateWorkOrderBody);
    await updateWorkOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getWorkOrder(actor!.companyId, params.id));
  },
  { permission: "work-order:update" },
);
