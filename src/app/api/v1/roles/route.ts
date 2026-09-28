import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { createRole, listRoles } from "@/server/services/user-admin.service";
import { createRoleBody } from "@/server/validation/admin";

/**
 * GET  /api/v1/roles — roles with their permissions and user counts.
 * POST /api/v1/roles — a custom role; only permissions the caller holds.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(async ({ actor }) => ok(await listRoles(actor!.companyId)), { permission: "role:read" });

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const role = await createRole(await parseBody(req, createRoleBody), { actor: actor!, requestId, clientInfo });
    return created(role, `/api/v1/roles/${role.id}`);
  },
  { permission: "role:create" },
);
