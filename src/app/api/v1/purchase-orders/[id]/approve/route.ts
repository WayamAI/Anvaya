import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getPurchaseOrder } from "@/server/services/purchase-order.service";
import { approvePurchaseOrder } from "@/server/services/purchase-order-write.service";

/** POST /api/v1/purchase-orders/:id/approve — DRAFT → APPROVED. The vendor must be on the ASL. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await approvePurchaseOrder(params.id, { actor: actor!, requestId, clientInfo });
    return ok(await getPurchaseOrder(actor!.companyId, params.id));
  },
  { permission: "purchase-order:approve" },
);
