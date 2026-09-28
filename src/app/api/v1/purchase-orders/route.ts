import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { getPurchaseOrder, listPurchaseOrders } from "@/server/services/purchase-order.service";
import { createPurchaseOrder } from "@/server/services/purchase-order-write.service";
import { createPurchaseOrderBody } from "@/server/validation/purchasing";

/**
 * GET  /api/v1/purchase-orders — every PO, newest order first, with counts
 *      per status and a derived overdue count.
 * POST /api/v1/purchase-orders — raise a DRAFT PO. Prices default to the
 *      vendor's price on file; the number is assigned by the server.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listPurchaseOrders(actor!.companyId)),
  { permission: "purchase-order:read" },
);

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, createPurchaseOrderBody);
    const { id } = await createPurchaseOrder(input, { actor: actor!, requestId, clientInfo });
    return created(await getPurchaseOrder(actor!.companyId, id), `/api/v1/purchase-orders/${id}`);
  },
  { permission: "purchase-order:create" },
);
