import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getExhaustionAlerts } from "@/server/services/inventory.service";

/**
 * GET /api/v1/inventory/exhaustion-alerts — material-locations running out
 * within 14 days, with the day stock runs out and the day to reorder by.
 *
 * Days of cover is the same figure Multi-location shows. Locations holding
 * stock without a demand figure are counted in `notAssessed`, not alerted.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await getExhaustionAlerts(actor!.companyId)),
  { permission: "inventory:read" },
);
