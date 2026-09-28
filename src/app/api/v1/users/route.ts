import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { createUser, listUsers } from "@/server/services/user-admin.service";
import { createUserBody } from "@/server/validation/admin";

/**
 * GET  /api/v1/users — every user in the company with roles and lock state.
 * POST /api/v1/users — create a user who must set their own password at first
 *      sign-in. A server-generated temporary password is returned once.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(async ({ actor }) => ok(await listUsers(actor!.companyId)), { permission: "user:read" });

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, createUserBody);
    const result = await createUser(input, { actor: actor!, requestId, clientInfo });
    const res = created(result, `/api/v1/users/${result.user.id}`);
    // A temporary password must never be cached anywhere on the way back.
    res.headers.set("Cache-Control", "no-store");
    return res;
  },
  { permission: "user:create" },
);
