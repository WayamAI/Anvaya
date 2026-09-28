import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getPurchaseOrder } from "@/server/services/purchase-order.service";
import { cancelPurchaseOrder } from "@/server/services/purchase-order-write.service";
import { cancelPurchaseOrderBody } from "@/server/validation/purchasing";

/**
 * POST /api/v1/purchase-orders/:id/cancel — `{ reason }`. On a partially
 * received PO this cancels the remainder; what arrived stays received.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, cancelPurchaseOrderBody);
    await cancelPurchaseOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getPurchaseOrder(actor!.companyId, params.id));
  },
  { permission: "purchase-order:update" },
);
