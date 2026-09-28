import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getLotDetail } from "@/server/services/lot.service";

/**
 * GET /api/v1/inventory/lots/:id — one lot with its backward trace (receipt,
 * or the producing work order and the lots it consumed) and forward trace
 * (customer dispatches and work orders that used it).
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getLotDetail(actor!.companyId, params.id)),
  { permission: "inventory:read" },
);
