"use client";

import { forwardRef } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import type { IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
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
  ({ icon, label, active = false, disabled, className, ...props }, ref) => (
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
          ? "bg-action-primary text-icon-on-color hover:bg-action-primary-hover"
          : "bg-action text-icon-tertiary hover:bg-surface-raised-x2 hover:text-icon-secondary",
        disabled && "bg-action-secondary-disabled text-icon-disabled hover:bg-action-secondary-disabled",
        "disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      <AppIcon name={icon} size="lg" />
    </button>
  ),
);

SidebarItem.displayName = "SidebarItem";

export { SidebarItem };
