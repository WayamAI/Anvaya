import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/command-center-data";

interface StatusBadgeProps {
  severity: Severity;
  /** `dot` for dense table cells, `pill` where the label needs to carry weight. */
  variant?: "dot" | "pill";
  label?: string;
  className?: string;
}

const tone: Record<Severity, { text: string; bg: string; dot: string; label: string }> = {
  critical: {
    text: "text-critical",
    bg: "bg-feedback-critical-subtle",
    dot: "bg-feedback-critical",
    label: "Critical",
  },
  warning: {
    text: "text-warning",
    bg: "bg-feedback-warning-subtle",
    dot: "bg-feedback-warning",
    label: "Warning",
  },
  info: {
    text: "text-muted",
    bg: "bg-surface-elevated",
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
        <span className={cn("text-[12px] leading-none", t.text)}>{text}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-cc-pill px-2 py-0.5",
        "text-[11px] font-medium uppercase leading-[16px] tracking-[0.06em]",
        t.bg,
        t.text,
        className,
      )}
    >
      {text}
    </span>
  );
}
