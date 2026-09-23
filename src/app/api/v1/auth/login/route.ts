import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { loginSchema } from "@/server/validation/auth";
import { login } from "@/server/services/auth.service";
import { toPublicActor } from "@/server/auth/rbac";
import { setSessionCookie } from "@/server/auth/cookie";

/** POST /api/v1/auth/login — exchange credentials for a session cookie. */
export const dynamic = "force-dynamic";

export const POST = withApi(
  async ({ req, clientInfo }) => {
    const input = await parseBody(req, loginSchema);
    const { token, expiresAt, actor } = await login(input, clientInfo);

    // The token goes in an httpOnly cookie and is never part of the body, so
    // no script on the page can read it.
    const res = ok({ user: toPublicActor(actor), expiresAt });
    setSessionCookie(res, token, expiresAt);
    return res;
  },
  { auth: false },
);
