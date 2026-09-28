import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listBomProducts } from "@/server/services/bom.service";

/**
 * GET /api/v1/boms — every made product (finished, semi-finished, or with a
 * BOM), each with its BOM summary, or `bom: null` where none is recorded.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listBomProducts(actor!.companyId)),
  { permission: "bom:read" },
);
