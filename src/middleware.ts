import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast redirect for visitors with no session cookie at all.
 *
 * This is a convenience, NOT the security boundary. Middleware runs on the
 * Edge runtime, where there is no database connection, so it can only see
 * whether a cookie is present — not whether it names a session that is still
 * valid, unexpired and unrevoked. A forged cookie sails straight through here.
 *
 * The real checks are elsewhere and are not optional:
 *   - every API route resolves the session against the database
 *   - every mutating service call goes through requirePermission()
 *
 * What this buys is the removal of a blank frame: without it, a signed-out
 * visitor loads the app shell, waits for /api/v1/auth/me to answer, and only
 * then gets redirected.
 */

const SESSION_COOKIE = "anvaya.session";

/** Reachable without signing in. */
const PUBLIC_PATHS = ["/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // Preserved so the login screen can return the visitor to where they were
  // headed. Only a path, never a full URL, so it cannot be used to bounce
  // someone to another origin after signing in.
  if (pathname !== "/") url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  /*
    Everything except API routes, Next's internals and static files.

    API routes are excluded deliberately: an unauthenticated API call must
    answer 401 so a client can handle it, not 302 to an HTML login page that
    a fetch() would then try to parse as JSON.
  */
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|fonts|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
