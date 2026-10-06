import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { loginSchema } from "@/server/validation/auth";
import { consume, LIMITS } from "@/server/api/rate-limit";
import { login } from "@/server/services/auth.service";
import { toPublicActor } from "@/server/auth/rbac";
import { setSessionCookie } from "@/server/auth/cookie";
import { maybePurgeExpiredRecords } from "@/server/services/retention.service";

/** POST /api/v1/auth/login — exchange credentials for a session cookie. */
export const dynamic = "force-dynamic";

export const POST = withApi(
  async ({ req, clientInfo }) => {
    const input = await parseBody(req, loginSchema);
    // Checked before the password is: a throttled attempt costs no argon2 work.
    await consume(`login:ip:${clientInfo.ipAddress ?? "unknown"}`, LIMITS.loginPerIp);
    await consume(`login:account:${input.company}:${input.email}`, LIMITS.loginPerEmail);
    const { token, expiresAt, actor } = await login(input, clientInfo);
    // Occasional housekeeping of ended sessions and old idempotency keys.
    maybePurgeExpiredRecords();

    // The token goes in an httpOnly cookie and is never part of the body, so
    // no script on the page can read it.
    const res = ok({ user: toPublicActor(actor), expiresAt });
    setSessionCookie(res, token, expiresAt);
    return res;
  },
  { auth: false },
);
