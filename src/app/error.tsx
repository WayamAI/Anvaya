"use client";

import { ErrorFallback } from "@/components/app/error-fallback";

/** A public page (sign-in) or the app shell itself failed to render. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <ErrorFallback error={error} reset={reset} scope="root" />
    </div>
  );
}
