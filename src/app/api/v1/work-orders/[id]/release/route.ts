import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";
import { releaseWorkOrder } from "@/server/services/work-order-write.service";

/** POST /api/v1/work-orders/:id/release — PLANNED or FIRMED → RELEASED to the shop floor. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await releaseWorkOrder(params.id, { actor: actor!, requestId, clientInfo });
    return ok(await getWorkOrder(actor!.companyId, params.id));
  },
  { permission: "work-order:update" },
);
