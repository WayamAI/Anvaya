import { cn } from "@/lib/utils";
import type { Severity } from "./types";

interface StatusBadgeProps {
  severity: Severity;
  /** `dot` for dense table cells, `pill` where the label needs to carry weight. */
  variant?: "dot" | "pill";
  label?: string;
  className?: string;
}

/**
 * Severity maps onto the feedback token family. `info` stays deliberately
 * neutral rather than blue, so colour in the table always means "attention".
 */
const tone: Record<Severity, { text: string; bg: string; dot: string; label: string }> = {
  critical: {
    text: "text-error",
    bg: "bg-feedback-error-background",
    dot: "bg-feedback-error-icon",
    label: "Critical",
  },
  warning: {
    text: "text-warning",
    bg: "bg-feedback-warning-background",
    dot: "bg-feedback-warning-icon",
    label: "Warning",
  },
  info: {
    text: "text-tertiary",
    bg: "bg-feedback-neutral-background",
    dot: "bg-icon-tertiary",
    label: "Info",
  },
};

export function StatusBadge({ severity, variant = "dot", label, className }: StatusBadgeProps) {
  const t = tone[severity];
  const text = label ?? t.label;

  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} aria-hidden="true" />
        <span className={cn("text-body-sm", t.text)}>{text}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-cc-pill px-2 py-0.5",
        "text-caption font-medium uppercase tracking-[0.06em]",
        t.bg,
        t.text,
        className,
      )}
    >
      {text}
    </span>
  );
}
