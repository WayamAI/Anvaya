import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { getSalesOrder, listSalesOrders } from "@/server/services/sales-order.service";
import { createSalesOrder } from "@/server/services/sales-order-write.service";
import { createSalesOrderBody, listSalesOrdersQuery } from "@/server/validation/sales";

/**
 * GET  /api/v1/sales-orders — every sales order, newest first, with counts
 *      per status, a derived overdue count and the headline figures, measured
 *      against the planning as-of date.
 * POST /api/v1/sales-orders — book a CONFIRMED order; number assigned by the
 *      server.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, listSalesOrdersQuery);
    const { list, nextCursor, total } = await listSalesOrders(actor!.companyId, query);
    return ok(list, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "sales-order:read" },
);

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, createSalesOrderBody);
    const { id } = await createSalesOrder(input, { actor: actor!, requestId, clientInfo });
    return created(await getSalesOrder(actor!.companyId, id), `/api/v1/sales-orders/${id}`);
  },
  { permission: "sales-order:create" },
);
