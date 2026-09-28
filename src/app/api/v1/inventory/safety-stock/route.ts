import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getSafetyStock } from "@/server/services/inventory.service";

/**
 * GET /api/v1/inventory/safety-stock — each policy's current safety stock
 * against the recommendation Z × σ × √lead time, with the inputs used.
 *
 * Lead time is chosen exactly as for exhaustion alerts. A recommendation
 * with a missing input is null, with `unavailableReason` saying which.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await getSafetyStock(actor!.companyId)),
  { permission: "inventory:read" },
);
