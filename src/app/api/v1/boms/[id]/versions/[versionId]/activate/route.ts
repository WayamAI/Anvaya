import { withApi } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { activateBomVersion } from "@/server/services/bom-write.service";

/**
 * POST /api/v1/boms/:id/versions/:versionId/activate — make this the version
 * new work orders use; the previous active version is retired as of today.
 * Refused if it would make the product a component of itself.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string; versionId: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await activateBomVersion(params.id, params.versionId, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "bom:update" },
);
