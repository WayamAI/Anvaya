import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { getWorkOrder, listWorkOrders } from "@/server/services/work-order.service";
import { createWorkOrder } from "@/server/services/work-order-write.service";
import { createWorkOrderBody } from "@/server/validation/production";

/**
 * GET  /api/v1/work-orders — all work orders, newest planned start first,
 *      with counts per status and a derived overdue count.
 * POST /api/v1/work-orders — plan an order at a manufacturing location; its
 *      components are snapshotted from the product's active BOM version (or
 *      the one named).
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listWorkOrders(actor!.companyId)),
  { permission: "work-order:read" },
);

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, createWorkOrderBody);
    const { id } = await createWorkOrder(input, { actor: actor!, requestId, clientInfo });
    return created(await getWorkOrder(actor!.companyId, id), `/api/v1/work-orders/${id}`);
  },
  { permission: "work-order:create" },
);
