import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getMaterial } from "@/server/services/material.service";

/**
 * GET /api/v1/materials/:id — one material with its category, unit, planning
 * policy per location and stock balance per location.
 *
 * A material belonging to another company is reported as not found.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getMaterial(actor!.companyId, params.id)),
  { permission: "material:read" },
);
