import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { updateUser } from "@/server/services/user-admin.service";
import { updateUserBody } from "@/server/validation/admin";

/** PATCH /api/v1/users/:id — name, active flag and roles. Deactivation signs the user out everywhere. */
export const dynamic = "force-dynamic";

export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await updateUser(params.id, await parseBody(req, updateUserBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "user:update" },
);
