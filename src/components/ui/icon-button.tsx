"use client";

import { forwardRef } from "react";
import { AppIcon, type IconSize } from "./app-icon";
import type { IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type IconButtonVariant = "ghost" | "subtle" | "inverse";
export type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Required: the control is icon-only, so this is its accessible name. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Fully rounded, for rail-style navigation. Defaults to a soft square. */
  round?: boolean;
}

const container: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

/** Icons stay a step below the container so the control keeps its padding. */
const glyph: Record<IconButtonSize, IconSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

const variantClass: Record<IconButtonVariant, string> = {
  ghost:
    "bg-action-tertiary text-icon-tertiary hover:bg-action-tertiary-hover hover:text-icon-secondary active:bg-action-tertiary-focused active:text-icon-primary",
  subtle:
    "bg-action text-icon-secondary hover:bg-surface-raised-x2 hover:text-icon-primary",
  inverse: "bg-action-primary text-icon-on-color hover:bg-action-primary-hover",
};

/**
 * Icon-only control.
 *
 * Colour flows through `currentColor` from the variant to the glyph, so hover
 * and active states need to be declared once on the container rather than
 * mirrored onto the icon.
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { icon, label, variant = "ghost", size = "md", round = false, className, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        // inline-flex + centring is what makes the glyph look centred rather
        // than merely being centred; never nudge icons with margins.
        "inline-flex shrink-0 items-center justify-center",
        "transition-colors duration-150 ease-cc",
        round ? "rounded-full" : "rounded-cc-md",
        container[size],
        variantClass[variant],
        disabled && "pointer-events-none bg-action-secondary-disabled text-icon-disabled",
        className,
      )}
      {...props}
    >
      <AppIcon name={icon} size={glyph[size]} />
    </button>
  ),
);

IconButton.displayName = "IconButton";

export { IconButton };
