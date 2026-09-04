"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Route guard for the demo app: any email/password accepted at /login sets
 * `matrixops_auth` in localStorage. This component just checks that flag
 * exists and redirects to /login (preserving the intended destination) if not.
 *
 * The check runs in an effect rather than during render because localStorage
 * is unavailable while the tree is server-rendered.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"pending" | "authed">("pending");

  useEffect(() => {
    if (localStorage.getItem("matrixops_auth") === "true") {
      setStatus("authed");
      return;
    }
    sessionStorage.setItem("matrixops_from", pathname);
    router.replace("/login");
  }, [pathname, router]);

  if (status === "pending") {
    return <div className="h-screen w-full bg-background" aria-busy="true" />;
  }

  return <>{children}</>;
}
