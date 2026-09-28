import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getSalesOrder } from "@/server/services/sales-order.service";

/**
 * GET /api/v1/sales-orders/:id — header, customer and lines, with the lots
 * each line was shipped from where the ledger records it, stock of each
 * line's material and open work orders for it.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getSalesOrder(actor!.companyId, params.id)),
  { permission: "sales-order:read" },
);
