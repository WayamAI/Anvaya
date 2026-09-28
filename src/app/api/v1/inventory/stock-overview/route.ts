import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getStockOverview } from "@/server/services/inventory.service";
import { stockOverviewQuery } from "@/server/validation/material";

/**
 * GET /api/v1/inventory/stock-overview — stock per material and location,
 * thresholds, value and status, plus the summary figures for the page header.
 *
 * `?locationId=` restricts rows, thresholds and totals to one location.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, stockOverviewQuery);
    return ok(await getStockOverview(actor!.companyId, query));
  },
  { permission: "inventory:read" },
);
