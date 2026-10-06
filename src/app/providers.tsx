"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient, redirectToLogin } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Created lazily per-mount so the cache is never shared across requests.
  // Retry rules and the expired-session redirect live in lib/query-client.
  const [queryClient] = useState(() => createQueryClient({ onSessionExpired: redirectToLogin }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="anvaya-theme">
        <TooltipProvider>
          {children}
          <Toaster />
          <Sonner />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
