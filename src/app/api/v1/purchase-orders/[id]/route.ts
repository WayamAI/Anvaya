import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getPurchaseOrder } from "@/server/services/purchase-order.service";

/**
 * GET /api/v1/purchase-orders/:id — lines with received and outstanding
 * quantities, goods receipts, and who created and approved the order.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getPurchaseOrder(actor!.companyId, params.id)),
  { permission: "purchase-order:read" },
);
