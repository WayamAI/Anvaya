import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getSalesOrder } from "@/server/services/sales-order.service";
import { updateSalesOrder } from "@/server/services/sales-order-write.service";
import { updateSalesOrderBody } from "@/server/validation/sales";

/**
 * GET   /api/v1/sales-orders/:id — header, customer and lines, with the lots
 *       each line was shipped from, stock of each line's material and open
 *       work orders for it.
 * PATCH — edit a CONFIRMED order that has shipped nothing. `lines`, when
 *       sent, replaces every line.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getSalesOrder(actor!.companyId, params.id)),
  { permission: "sales-order:read" },
);

export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, updateSalesOrderBody);
    await updateSalesOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getSalesOrder(actor!.companyId, params.id));
  },
  { permission: "sales-order:update" },
);
