import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listPurchaseOrders } from "@/server/services/purchase-order.service";

/**
 * GET /api/v1/purchase-orders — every PO, newest order first, with counts
 * per status and a derived overdue count. Read-only.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listPurchaseOrders(actor!.companyId)),
  { permission: "purchase-order:read" },
);
