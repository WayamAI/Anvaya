"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ElementType;
  /**
   * Never rendered as visible text — the rail is icon-only. It carries the
   * accessible name and the native tooltip, and is what a future hover
   * tooltip would display.
   */
  label: string;
  active?: boolean;
}

/**
 * One circular control in the rail.
 *
 * Inactive controls keep a faint filled disc rather than going fully
 * transparent, so the column reads as a row of instruments even at rest.
 */
const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ icon: Icon, label, active = false, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      className={cn(
        "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full",
        "transition-colors duration-150 ease-cc",
        active
          ? "bg-action-primary text-on-light hover:bg-action-primary-hover"
          : "bg-surface-secondary text-icon-secondary hover:bg-surface-elevated hover:text-icon-primary",
        disabled && "bg-action-disabled text-disabled hover:bg-action-disabled",
        "disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
    </button>
  ),
);

SidebarItem.displayName = "SidebarItem";

export { SidebarItem };
