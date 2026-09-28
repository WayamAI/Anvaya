import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getPurchaseOrder } from "@/server/services/purchase-order.service";
import { sendPurchaseOrder } from "@/server/services/purchase-order-write.service";

/** POST /api/v1/purchase-orders/:id/send — APPROVED → ORDERED, once the vendor has the PO. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await sendPurchaseOrder(params.id, { actor: actor!, requestId, clientInfo });
    return ok(await getPurchaseOrder(actor!.companyId, params.id));
  },
  { permission: "purchase-order:update" },
);
