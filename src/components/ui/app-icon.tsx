import { icons, type IconName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
export type IconTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quaternary"
  | "on-color"
  | "success"
  | "info"
  | "warning"
  | "error";

interface AppIconProps {
  name: IconName;
  size?: IconSize;
  /**
   * Semantic colour. Omit to inherit `currentColor` from the parent, which is
   * what most call sites want — a control decides its own colour and its icon
   * follows it through hover and active states.
   */
  tone?: IconTone;
  className?: string;
  /** Give an icon that carries meaning on its own an accessible name. */
  "aria-label"?: string;
  "aria-hidden"?: boolean;
}

const sizeClass: Record<IconSize, string> = {
  xs: "h-icon-xs w-icon-xs",
  sm: "h-icon-sm w-icon-sm",
  md: "h-icon-md w-icon-md",
  lg: "h-icon-lg w-icon-lg",
  xl: "h-icon-xl w-icon-xl",
  "2xl": "h-icon-2xl w-icon-2xl",
  "3xl": "h-icon-3xl w-icon-3xl",
};

const toneClass: Record<IconTone, string> = {
  primary: "text-icon-primary",
  secondary: "text-icon-secondary",
  tertiary: "text-icon-tertiary",
  quaternary: "text-icon-quaternary",
  "on-color": "text-icon-on-color",
  success: "text-feedback-success-icon",
  info: "text-feedback-info-icon",
  warning: "text-feedback-warning-icon",
  error: "text-feedback-error-icon",
};

/**
 * The only way to render an icon in the application.
 *
 * Takes a semantic name rather than a glyph, so the picture for a concept is
 * decided once in the registry. Decorative by default: unless an `aria-label`
 * is passed, the icon is hidden from assistive technology, because the label
 * almost always belongs to the surrounding control.
 */
export function AppIcon({
  name,
  size = "md",
  tone,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: AppIconProps) {
  const Glyph = icons[name];
  const labelled = Boolean(ariaLabel);

  return (
    <Glyph
      // Uniform stroke is what keeps mixed icons looking like one family.
      strokeWidth={1.75}
      className={cn("shrink-0", sizeClass[size], tone && toneClass[tone], className)}
      aria-label={ariaLabel}
      role={labelled ? "img" : undefined}
      aria-hidden={ariaHidden ?? !labelled}
      focusable="false"
    />
  );
}
