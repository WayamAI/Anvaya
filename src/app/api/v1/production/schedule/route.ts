import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getProductionSchedule } from "@/server/services/schedule.service";

/**
 * GET /api/v1/production/schedule — work orders placed on their work centres
 * for their planned days, with overlaps, unit-matched capacity load, material
 * shortages, overdue orders and the stored constraints (utilisation as
 * recorded). Read-only.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await getProductionSchedule(actor!.companyId)),
  { permission: "work-order:read" },
);
