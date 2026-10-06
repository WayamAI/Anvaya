import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { getPurchaseOrder, listPurchaseOrders } from "@/server/services/purchase-order.service";
import { createPurchaseOrder } from "@/server/services/purchase-order-write.service";
import { createPurchaseOrderBody, listPurchaseOrdersQuery } from "@/server/validation/purchasing";

/**
 * GET  /api/v1/purchase-orders — one page of POs, newest order first:
 *      `?status=` (a status, or `overdue`), `?q=` (number or vendor),
 *      `?limit=` (default 50, max 200), `?cursor=`. `counts` per tab cover the
 *      whole company; `meta` carries `nextCursor`, `limit` and `total`.
 * POST /api/v1/purchase-orders — raise a DRAFT PO. Prices default to the
 *      vendor's price on file; the number is assigned by the server.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, listPurchaseOrdersQuery);
    const { list, nextCursor, total } = await listPurchaseOrders(actor!.companyId, query);
    return ok(list, { meta: { nextCursor, limit: query.limit, total } });
  },
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
