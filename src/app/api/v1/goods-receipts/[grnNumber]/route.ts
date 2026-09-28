import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { AppError } from "@/server/errors/app-error";
import { getGoodsReceiptByNumber } from "@/server/services/trace-lookup.service";
import { grnNumberParam } from "@/server/validation/lot";

/**
 * GET /api/v1/goods-receipts/:grnNumber — a receipt by its business number,
 * with its lines, the lots they created, and lots later produced from them.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ grnNumber: string }>(
  async ({ params, actor }) => {
    const parsed = grnNumberParam.safeParse(decodeURIComponent(params.grnNumber));
    if (!parsed.success) throw AppError.validation("Invalid GRN number", [{ path: "grnNumber", message: parsed.error.issues[0].message }]);
    return ok(await getGoodsReceiptByNumber(actor!.companyId, parsed.data));
  },
  { permission: "purchase-order:read" },
);
