import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";

/**
 * GET /api/v1/work-orders/:id — operations, components with their lots and
 * material readiness at the order's location, and the lots it produced.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getWorkOrder(actor!.companyId, params.id)),
  { permission: "work-order:read" },
);
