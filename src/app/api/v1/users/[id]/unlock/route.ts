import { withApi } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { unlockUser } from "@/server/services/user-admin.service";

/** POST /api/v1/users/:id/unlock — clear a lock-out after failed sign-ins. */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await unlockUser(params.id, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "user:update" },
);
