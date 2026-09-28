import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { upsertPolicy } from "@/server/services/master-data.service";
import { policyBody } from "@/server/validation/masterdata";

/**
 * PUT /api/v1/materials/:id/policies/:locationId — the material's planning
 * policy at a location (safety stock, reorder point, lot sizing, lead times),
 * created or replaced whole. MAKE needs a manufacturing location.
 */
export const dynamic = "force-dynamic";

export const PUT = withApi<{ id: string; locationId: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await upsertPolicy(params.id, params.locationId, await parseBody(req, policyBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "material:update" },
);
