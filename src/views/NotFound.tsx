"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const NotFound = () => {
  const pathname = usePathname();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 font-display text-display-2xl">404</h1>
        <p className="mb-4 text-display-lg text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-foreground underline underline-offset-2 hover:text-foreground">
          Return to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
