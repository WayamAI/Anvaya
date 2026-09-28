import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";
import { cancelWorkOrder } from "@/server/services/work-order-write.service";
import { cancelWorkOrderBody } from "@/server/validation/production";

/** POST /api/v1/work-orders/:id/cancel — `{ reason }`; only while nothing is issued or produced. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, cancelWorkOrderBody);
    await cancelWorkOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getWorkOrder(actor!.companyId, params.id));
  },
  { permission: "work-order:update" },
);
