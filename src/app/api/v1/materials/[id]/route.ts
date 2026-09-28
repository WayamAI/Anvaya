import { withApi, parseBody } from "@/server/api/with-api";
import { noContent, ok } from "@/server/api/respond";
import { getMaterial } from "@/server/services/material.service";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

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

/** Edit. Deactivation is refused while the record is still in use. */
export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await md.updateMaterial(params.id, await parseBody(req, v.updateMaterialBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "material:update" },
);
