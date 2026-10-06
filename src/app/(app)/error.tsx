"use client";

import { ErrorFallback } from "@/components/app/error-fallback";

/**
 * A screen inside the signed-in app failed to render. The sidebar and the
 * session around it stay, so the user can retry or simply go elsewhere.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} scope="app" />;
}
