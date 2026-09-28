import { withApi } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { deleteBomVersion } from "@/server/services/bom-write.service";

/** DELETE /api/v1/boms/:id/versions/:versionId — an inactive version no work order has used. */
export const dynamic = "force-dynamic";

export const DELETE = withApi<{ id: string; versionId: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await deleteBomVersion(params.id, params.versionId, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "bom:delete" },
);
