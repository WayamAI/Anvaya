import { NextResponse } from "next/server";
import { withApi, parseBody } from "@/server/api/with-api";
import { hashBody, readIdempotencyKey, runIdempotent } from "@/server/api/idempotency";
import { reportOutput } from "@/server/services/work-order-write.service";
import { outputBody } from "@/server/validation/production";

/** POST /api/v1/work-orders/:id/output — report good output (a produced lot and a PRODUCTION_RECEIPT at actual cost) and scrap; `complete: true` finishes the order. Honours `Idempotency-Key`. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, outputBody);
    const key = readIdempotencyKey(req);
    const result = await runIdempotent(
      key
        ? { companyId: actor!.companyId, userId: actor!.userId, key, scope: `work-order:output:${params.id}`, requestHash: hashBody(input) }
        : null,
      201,
      (tx) => reportOutput(tx, params.id, input, { actor: actor!, requestId, clientInfo }),
    );
    const res = NextResponse.json({ data: result.body }, { status: result.status });
    if (result.replayed) res.headers.set("Idempotent-Replayed", "true");
    return res;
  },
  { permission: "work-order:update" },
);
