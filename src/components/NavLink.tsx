"use client";

import { forwardRef } from "react";
import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLinkProps extends Omit<LinkProps, "href"> {
  to: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children?: React.ReactNode;
}

/**
 * Anchor that knows whether it points at the current route, so callers can
 * style the active state without wiring up `usePathname` themselves.
 */
const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ className, activeClassName, to, exact = false, children, ...props }, ref) => {
    const pathname = usePathname();
    const isActive = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

    return (
      <Link
        ref={ref}
        href={to}
        aria-current={isActive ? "page" : undefined}
        className={cn(className, isActive && activeClassName)}
        {...props}
      >
        {children}
      </Link>
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
