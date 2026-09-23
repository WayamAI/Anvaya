"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, type SessionUser } from "./session-context";

/**
 * Route guard.
 *
 * Asks the server who the caller is. The session lives in an httpOnly cookie
 * that this code cannot read, which is the point: there is no client-side
 * flag to flip. A user who edits storage or React state gets a prettier
 * shell and nothing else, because every API call is checked independently.
 *
 * The check runs in an effect because the cookie is not readable during
 * render, and the answer is cached in context so each screen does not
 * re-request the same identity.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{ status: "pending" | "authed" | "anon"; user: SessionUser | null }>({
    status: "pending",
    user: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });

        if (cancelled) return;

        if (res.ok) {
          const body = await res.json();
          setState({ status: "authed", user: body.data.user as SessionUser });
          return;
        }

        // Remember the destination so signing in returns the user to it
        // rather than dumping them on the dashboard.
        try {
          sessionStorage.setItem("anvaya_from", pathname);
        } catch {
          // Private-mode storage denial is not worth blocking the redirect.
        }
        setState({ status: "anon", user: null });
        router.replace("/login");
      } catch {
        if (cancelled) return;
        // A network failure is not proof of being signed out, but the app
        // cannot function without the server either, so send them to sign in.
        setState({ status: "anon", user: null });
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (state.status !== "authed" || !state.user) {
    // Matches the app background so the wait reads as the page still opening
    // rather than as a flash of empty chrome.
    return <div className="h-screen w-full bg-background" aria-busy="true" />;
  }

  return <SessionProvider user={state.user}>{children}</SessionProvider>;
}
