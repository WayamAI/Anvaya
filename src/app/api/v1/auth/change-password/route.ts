import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { changePasswordSchema } from "@/server/validation/auth";
import { changePassword } from "@/server/services/auth.service";

/** POST /api/v1/auth/change-password — rotate the current user's password. */
export const dynamic = "force-dynamic";

export const POST = withApi(async ({ req, actor, clientInfo }) => {
  const input = await parseBody(req, changePasswordSchema);
  const result = await changePassword(actor!, input, clientInfo);
  return ok(result);
});
