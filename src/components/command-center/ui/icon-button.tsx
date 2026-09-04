"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type IconButtonVariant = "ghost" | "surface" | "active";
type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Required: these buttons are icon-only, so they carry no text label. */
  label: string;
}

const variants: Record<IconButtonVariant, string> = {
  ghost: "text-muted hover:bg-surface-tertiary hover:text-primary",
  surface:
    "bg-surface-tertiary border border-subtle text-secondary hover:bg-surface-elevated hover:text-primary hover:border-default",
  active: "bg-action-primary text-on-light shadow-cc-sm",
};

const sizes: Record<IconButtonSize, string> = {
  sm: "h-7 w-7 rounded-cc-sm",
  md: "h-9 w-9 rounded-cc-md",
  lg: "h-10 w-10 rounded-[12px]",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "md", label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center transition-colors duration-200 ease-cc",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  ),
);

IconButton.displayName = "IconButton";

export { IconButton };
