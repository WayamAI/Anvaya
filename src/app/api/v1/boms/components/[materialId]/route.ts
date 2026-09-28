import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { hasPermission } from "@/server/auth/rbac";
import { getComponentDetail } from "@/server/services/bom.service";

/**
 * GET /api/v1/boms/components/:materialId — stock, lead time, vendors and
 * where-used for one component. Open purchase order lines and the last price
 * paid are included only for callers holding `purchase-order:read`;
 * otherwise `purchasing` is null.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ materialId: string }>(
  async ({ params, actor }) =>
    ok(await getComponentDetail(actor!.companyId, params.materialId, hasPermission(actor, "purchase-order:read"))),
  { permission: "bom:read" },
);
