import { NextResponse } from "next/server";
import { withApi, parseBody } from "@/server/api/with-api";
import { hashBody, readIdempotencyKey, runIdempotent } from "@/server/api/idempotency";
import { issueComponents } from "@/server/services/work-order-write.service";
import { issueBody } from "@/server/validation/production";

/** POST /api/v1/work-orders/:id/issues — issue components: PRODUCTION_ISSUE movements from named lots or first-expiry-first-out. Honours `Idempotency-Key`. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, issueBody);
    const key = readIdempotencyKey(req);
    const result = await runIdempotent(
      key
        ? { companyId: actor!.companyId, userId: actor!.userId, key, scope: `work-order:issue:${params.id}`, requestHash: hashBody(input) }
        : null,
      201,
      (tx) => issueComponents(tx, params.id, input, { actor: actor!, requestId, clientInfo }),
    );
    const res = NextResponse.json({ data: result.body }, { status: result.status });
    if (result.replayed) res.headers.set("Idempotent-Replayed", "true");
    return res;
  },
  { permission: "work-order:update" },
);
