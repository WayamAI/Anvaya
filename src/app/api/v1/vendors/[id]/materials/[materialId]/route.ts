import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { upsertVendorMaterial } from "@/server/services/master-data.service";
import { vendorMaterialBody } from "@/server/validation/masterdata";

/**
 * PUT /api/v1/vendors/:id/materials/:materialId — what the vendor supplies
 * the material at: lead time, price, MOQ, multiple. Marking it preferred
 * clears any other preferred vendor for the material.
 */
export const dynamic = "force-dynamic";

export const PUT = withApi<{ id: string; materialId: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await upsertVendorMaterial(params.id, params.materialId, await parseBody(req, vendorMaterialBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "vendor:update" },
);
