import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { deleteRole, updateRole } from "@/server/services/user-admin.service";
import { updateRoleBody } from "@/server/validation/admin";

/** PATCH / DELETE /api/v1/roles/:id — custom roles only; a role in use cannot be deleted. */
export const dynamic = "force-dynamic";

export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await updateRole(params.id, await parseBody(req, updateRoleBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "role:update" },
);

export const DELETE = withApi<{ id: string }>(
  async ({ params, actor, requestId, clientInfo }) => {
    await deleteRole(params.id, { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "role:delete" },
);
