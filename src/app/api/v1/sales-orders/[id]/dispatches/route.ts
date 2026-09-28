import { NextResponse } from "next/server";
import { withApi, parseBody } from "@/server/api/with-api";
import { hashBody, readIdempotencyKey, runIdempotent } from "@/server/api/idempotency";
import { dispatchSalesOrder } from "@/server/services/sales-order-write.service";
import { dispatchBody } from "@/server/validation/sales";

/**
 * POST /api/v1/sales-orders/:id/dispatches — ship stock against the order.
 * Batch-tracked lines ship from the lots named, or first-expiry-first-out
 * from released lots. Honours `Idempotency-Key`.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, dispatchBody);
    const key = readIdempotencyKey(req);
    const result = await runIdempotent(
      key
        ? { companyId: actor!.companyId, userId: actor!.userId, key, scope: `sales-order:dispatch:${params.id}`, requestHash: hashBody(input) }
        : null,
      201,
      (tx) => dispatchSalesOrder(tx, params.id, input, { actor: actor!, requestId, clientInfo }),
    );
    const res = NextResponse.json({ data: result.body }, { status: result.status });
    if (result.replayed) res.headers.set("Idempotent-Replayed", "true");
    return res;
  },
  { permission: "sales-order:dispatch" },
);
