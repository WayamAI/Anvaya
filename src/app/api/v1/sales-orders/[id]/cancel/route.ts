import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getSalesOrder } from "@/server/services/sales-order.service";
import { cancelSalesOrder } from "@/server/services/sales-order-write.service";
import { cancelSalesOrderBody } from "@/server/validation/sales";

/**
 * POST /api/v1/sales-orders/:id/cancel — `{ reason }`. After a partial
 * dispatch this cancels the remainder; what shipped stays shipped.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, cancelSalesOrderBody);
    await cancelSalesOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getSalesOrder(actor!.companyId, params.id));
  },
  { permission: "sales-order:update" },
);
