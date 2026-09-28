import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getLotIndicators } from "@/server/services/lot.service";

/**
 * GET /api/v1/inventory/lots/indicators — backward and forward trace
 * completeness, lots needing containment, and lots expiring within 30 days
 * of today.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await getLotIndicators(actor!.companyId)),
  { permission: "inventory:read" },
);
