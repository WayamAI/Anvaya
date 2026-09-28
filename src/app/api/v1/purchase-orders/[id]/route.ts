import { withApi, parseBody } from "@/server/api/with-api";
import { noContent, ok } from "@/server/api/respond";
import { getPurchaseOrder } from "@/server/services/purchase-order.service";
import { deletePurchaseOrder, updatePurchaseOrder } from "@/server/services/purchase-order-write.service";
import { updatePurchaseOrderBody } from "@/server/validation/purchasing";

/**
 * GET    /api/v1/purchase-orders/:id — lines with received and outstanding
 *        quantities, goods receipts, and who created and approved the order.
 * PATCH  — edit a DRAFT. `lines`, when sent, replaces every line.
 * DELETE — delete a DRAFT. Anything later is cancelled, never deleted.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getPurchaseOrder(actor!.companyId, params.id)),
  { permission: "purchase-order:read" },
);

export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, updatePurchaseOrderBody);
    await updatePurchaseOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getPurchaseOrder(actor!.companyId, params.id));
  },
  { permission: "purchase-order:update" },
);

export const DELETE = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await deletePurchaseOrder(params.id, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "purchase-order:delete" },
);
