import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { logout } from "@/server/services/auth.service";
import { clearSessionCookie } from "@/server/auth/cookie";

/** POST /api/v1/auth/logout — revoke the current session. */
export const dynamic = "force-dynamic";

export const POST = withApi(async ({ actor, clientInfo }) => {
  // The session is revoked server-side as well as cleared client-side, so a
  // copied cookie is useless afterwards.
  if (actor) await logout(actor, clientInfo);
  const res = ok({ signedOut: true });
  clearSessionCookie(res);
  return res;
}, { auth: false });
