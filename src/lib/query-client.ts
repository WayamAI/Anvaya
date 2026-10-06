import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * React Query defaults for the app.
 *
 * Retries are for failures a retry can fix — the network dropped, or the
 * server answered 5xx — and stop after two. A 4xx is the server's considered
 * answer (signed out, not allowed, not found, invalid) and asking again only
 * delays showing it. Writes never retry: a POST that timed out may have
 * committed, and idempotency keys are the guard for a deliberate resubmit.
 *
 * A 401 anywhere means the session has ended (expired, revoked, signed out
 * elsewhere): the user is sent to sign in once, then back to the page.
 */

const MAX_RETRIES = 2;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!(error instanceof ApiError)) return false; // aborts and page bugs
  const transient = error.status === 0 || error.status >= 500;
  return transient && failureCount < MAX_RETRIES;
}

export const isSessionExpired = (error: unknown) => error instanceof ApiError && error.status === 401;

/** Where to send an expired session, or null when already on the sign-in page. */
export function loginRedirectTarget(pathname: string, search: string): string | null {
  if (pathname === "/login" || pathname.startsWith("/login/")) return null;
  const from = `${pathname}${search}`;
  return from === "/" ? "/login" : `/login?from=${encodeURIComponent(from)}`;
}

export function createQueryClient(opts: { onSessionExpired: () => void; retryDelay?: number }) {
  const onError = (error: unknown) => {
    if (isSessionExpired(error)) opts.onSessionExpired();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: shouldRetry, ...(opts.retryDelay !== undefined ? { retryDelay: opts.retryDelay } : {}) },
      mutations: { retry: false },
    },
  });
}

/**
 * Browser handler: a full navigation, so every cached query from the ended
 * session is dropped. Once per page load, however many queries fail at once.
 */
let redirecting = false;
export function redirectToLogin() {
  if (redirecting || typeof window === "undefined") return;
  const target = loginRedirectTarget(window.location.pathname, window.location.search);
  if (!target) return;
  redirecting = true;
  window.location.assign(target);
}
