import { withApi } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { resolveException } from "@/server/services/mrp-run.service";

/** POST /api/v1/mrp/exceptions/:id/resolve — mark handled; audited. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await resolveException(params.id, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "mrp:run" },
);
