import { withApi, parseBody } from "@/server/api/with-api";
import { created } from "@/server/api/respond";
import { createBomVersion } from "@/server/services/bom-write.service";
import { createBomVersionBody } from "@/server/validation/bom";

/** POST /api/v1/boms/:id/versions — a new, inactive version. Versions are immutable once created. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const v = await createBomVersion(params.id, await parseBody(req, createBomVersionBody), { actor: actor!, requestId, clientInfo });
    return created(v, `/api/v1/boms/${params.id}?version=${encodeURIComponent(v.version)}`);
  },
  { permission: "bom:update" },
);
