import type { NextResponse } from "next/server";
import { isProduction } from "@/server/config/env";
import { SESSION_COOKIE } from "./session";

/**
 * Session cookie policy, in one place so the flags cannot drift between the
 * route that sets them and the route that clears them.
 *
 *  httpOnly  script cannot read it, so an XSS bug cannot steal the session
 *  sameSite  "lax" blocks cross-site POSTs while keeping normal navigation
 *            working; this is the CSRF defence for a cookie-based session
 *  secure    HTTPS only in production, off locally so http://localhost works
 *  path      the whole app, since both pages and the API need it
 */
export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}
