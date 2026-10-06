"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { btnPrimary, btnSecondary } from "@/components/app/controls";

/**
 * What a screen shows when it fails to render.
 *
 * Says that something went wrong and how to recover, never what: the error's
 * message can carry SQL, hosts or internals, so it goes to the server log
 * (through /api/v1/client-errors) and the user gets a reference to quote.
 * Server-side failures arrive with Next's `digest`, the id in the server's
 * own log; a browser-side one gets a reference minted here.
 */

export type ErrorScope = "global" | "root" | "app";

/** Each error is reported once, however often its screen re-renders. */
const reported = new WeakSet<Error>();

function report(error: Error & { digest?: string }, reference: string, path: string, scope: ErrorScope) {
  if (reported.has(error)) return;
  reported.add(error);
  void fetch("/api/v1/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({
      message: (error.message || error.name || "Error").slice(0, 500),
      digest: error.digest ?? reference,
      path,
      scope,
      stack: error.stack?.slice(0, 4000),
    }),
  }).catch(() => {
    // Reporting is best effort; the recovery screen matters more.
  });
}

export function ErrorFallback({ error, reset, scope = "app" }: { error: Error & { digest?: string }; reset: () => void; scope?: ErrorScope }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const reference = useMemo(() => error.digest ?? `c-${Date.now().toString(36)}`, [error]);

  useEffect(() => report(error, reference, pathname, scope), [error, reference, pathname, scope]);

  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-heading-sm text-foreground">Something went wrong on this page</h1>
      <p className="mt-1 max-w-md text-body-md text-muted-foreground">
        It has been reported. Try again, or go back to the dashboard. Nothing you saved earlier is affected.
      </p>
      <p className="mt-2 text-caption text-muted-foreground">Reference {reference}</p>
      <div className="mt-5 flex gap-2">
        <button
          className={btnPrimary}
          onClick={() => {
            // Re-render the failed segment and fetch fresh server data.
            reset();
            router.refresh();
          }}
        >
          Try again
        </button>
        <Link className={btnSecondary} href="/">Back to the dashboard</Link>
      </div>
    </div>
  );
}
