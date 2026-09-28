import { NextResponse } from "next/server";
import { withApi, parseBody } from "@/server/api/with-api";
import { hashBody, readIdempotencyKey, runIdempotent } from "@/server/api/idempotency";
import { receiveGoods } from "@/server/services/goods-receipt.service";
import { createGoodsReceiptBody } from "@/server/validation/purchasing";

/**
 * POST /api/v1/goods-receipts — receive against a PO: creates the GRN, a lot
 * per batch-tracked line and RECEIPT movements, and advances the PO.
 *
 * Send `Idempotency-Key` so a retry or double submit posts once; a replayed
 * response carries `Idempotent-Replayed: true`.
 */
export const dynamic = "force-dynamic";

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, createGoodsReceiptBody);
    const key = readIdempotencyKey(req);
    const result = await runIdempotent(
      key
        ? { companyId: actor!.companyId, userId: actor!.userId, key, scope: "goods-receipt:create", requestHash: hashBody(input) }
        : null,
      201,
      (tx) => receiveGoods(tx, input, { actor: actor!, requestId, clientInfo }),
    );
    const res = NextResponse.json({ data: result.body }, { status: result.status });
    res.headers.set("Location", `/api/v1/goods-receipts/${result.body.grnNumber}`);
    if (result.replayed) res.headers.set("Idempotent-Replayed", "true");
    return res;
  },
  { permission: "goods-receipt:create" },
);
