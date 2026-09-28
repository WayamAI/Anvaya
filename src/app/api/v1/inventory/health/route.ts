import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getInventoryHealth } from "@/server/services/inventory.service";

/**
 * GET /api/v1/inventory/health — health scores, per-material issues,
 * recommendations, and stock value by location and category.
 *
 * Built on the same data as GET /inventory/stock-overview. Scores the data
 * cannot support (turnover, history) are returned as null.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await getInventoryHealth(actor!.companyId)),
  { permission: "inventory:read" },
);
