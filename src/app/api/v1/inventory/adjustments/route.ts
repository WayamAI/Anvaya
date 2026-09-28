import { NextResponse } from "next/server";
import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { hashBody, readIdempotencyKey, runIdempotent } from "@/server/api/idempotency";
import { adjustStock, listAdjustments } from "@/server/services/inventory-adjustment.service";
import { adjustmentBody, listAdjustmentsQuery } from "@/server/validation/inventory";

/**
 * GET  /api/v1/inventory/adjustments — newest first. `?materialId=` `?locationId=` `?limit=`
 * POST /api/v1/inventory/adjustments — post a count: the adjustment is
 *      counted − book, per lot for batch-tracked material. Honours
 *      `Idempotency-Key`.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => ok(await listAdjustments(actor!.companyId, parseQuery(req, listAdjustmentsQuery))),
  { permission: "inventory:read" },
);

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, adjustmentBody);
    const key = readIdempotencyKey(req);
    const result = await runIdempotent(
      key ? { companyId: actor!.companyId, userId: actor!.userId, key, scope: "inventory:adjust", requestHash: hashBody(input) } : null,
      201,
      (tx) => adjustStock(tx, input, { actor: actor!, requestId, clientInfo }),
    );
    const res = NextResponse.json({ data: result.body }, { status: result.status });
    if (result.replayed) res.headers.set("Idempotent-Replayed", "true");
    return res;
  },
  { permission: "inventory:adjust" },
);
