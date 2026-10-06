import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getWorkOrder } from "@/server/services/work-order.service";
import { completeWorkOrder } from "@/server/services/work-order-write.service";
import { completeWorkOrderBody } from "@/server/validation/production";

/**
 * POST /api/v1/work-orders/:id/complete — IN_PROGRESS → COMPLETED without
 * further output (a short close). Refused while components are issued short
 * of the output, unless `{ shortIssueReason }` comes from a user holding
 * `work-order:complete-short`. The body is optional.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = req.body ? await parseBody(req, completeWorkOrderBody) : {};
    await completeWorkOrder(params.id, input, { actor: actor!, requestId, clientInfo });
    return ok(await getWorkOrder(actor!.companyId, params.id));
  },
  { permission: "work-order:update" },
);
