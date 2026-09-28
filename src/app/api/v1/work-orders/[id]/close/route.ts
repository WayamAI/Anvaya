import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";
import { closeWorkOrder } from "@/server/services/work-order-write.service";

/** POST /api/v1/work-orders/:id/close — COMPLETED → CLOSED. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await closeWorkOrder(params.id, { actor: actor!, requestId, clientInfo });
    return ok(await getWorkOrder(actor!.companyId, params.id));
  },
  { permission: "work-order:update" },
);
