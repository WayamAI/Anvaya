import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listSalesOrders } from "@/server/services/sales-order.service";

/**
 * GET /api/v1/sales-orders — every sales order, newest first, with counts
 * per status, a derived overdue count and the headline figures, measured
 * against the planning as-of date. Read-only.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listSalesOrders(actor!.companyId)),
  { permission: "sales-order:read" },
);
