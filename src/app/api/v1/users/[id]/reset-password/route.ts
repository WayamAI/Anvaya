import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { resetUserPassword } from "@/server/services/user-admin.service";
import { resetPasswordBody } from "@/server/validation/admin";

/**
 * POST /api/v1/users/:id/reset-password — `{ password? }`. Issues a temporary
 * password (returned once when server-generated), clears any lock-out and
 * revokes every session; the user must set their own at next sign-in.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const res = ok(await resetUserPassword(params.id, await parseBody(req, resetPasswordBody), { actor: actor!, requestId, clientInfo }));
    res.headers.set("Cache-Control", "no-store");
    return res;
  },
  { permission: "user:update" },
);
