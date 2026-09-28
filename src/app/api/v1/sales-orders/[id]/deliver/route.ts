import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getSalesOrder } from "@/server/services/sales-order.service";
import { deliverSalesOrder } from "@/server/services/sales-order-write.service";
import { deliverBody } from "@/server/validation/sales";

/** POST /api/v1/sales-orders/:id/deliver — `{ deliveredDate? }`. DISPATCHED → DELIVERED. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, deliverBody);
    await deliverSalesOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getSalesOrder(actor!.companyId, params.id));
  },
  { permission: "sales-order:dispatch" },
);
