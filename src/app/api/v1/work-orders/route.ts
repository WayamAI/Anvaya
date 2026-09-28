import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listWorkOrders } from "@/server/services/work-order.service";

/**
 * GET /api/v1/work-orders — every work order, newest planned start first,
 * with counts per status and a derived overdue count.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listWorkOrders(actor!.companyId)),
  { permission: "work-order:read" },
);
