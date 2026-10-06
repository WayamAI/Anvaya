"use client";

import "./globals.css";
import { ErrorFallback } from "@/components/app/error-fallback";

/**
 * The root layout itself failed, so nothing around this renders — it brings
 * its own document. Without it Next shows a blank page.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background">
        <ErrorFallback error={error} reset={reset} scope="global" />
      </body>
    </html>
  );
}
