"use client";

import { ArrowDownRight, ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type HealthTone = "healthy" | "warning" | "critical";

export interface HealthSegment {
  tone: HealthTone;
  label: string;
  value: number;
}

interface HealthScoreCardProps {
  /** Whole-number percentage, e.g. 99. */
  score: number;
  /** Signed change over the selected period. Omitted renders no indicator. */
  delta?: number;
  segments: HealthSegment[];
  /** Plural noun for the bar's accessible summary, e.g. "vehicles". */
  entityLabel?: string;
  period?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const toneFill: Record<HealthTone, string> = {
  healthy: "bg-feedback-success",
  warning: "bg-feedback-warning",
  critical: "bg-feedback-critical",
};

/**
 * Fleet/asset health summary.
 *
 * Designed to float over the map, so it is kept deliberately low-elevation — a
 * thin border and a small shadow — to sit *on* the map rather than above it.
 * Data comes in via props; the card holds no source of its own.
 */
export function HealthScoreCard({
  score,
  delta,
  segments,
  entityLabel = "assets",
  period = "Today",
  actionLabel = "See all assets",
  onAction,
  className,
}: HealthScoreCardProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const rising = (delta ?? 0) >= 0;
  const DeltaIcon = rising ? ArrowUpRight : ArrowDownRight;

  const summary = segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ");

  return (
    <article className={cn("cc-panel w-[286px] p-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-label-md text-primary">Health score</h2>
          <button
            type="button"
            aria-label="How the health score is calculated"
            className="text-muted transition-colors duration-200 ease-cc hover:text-secondary"
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-cc-sm border border-muted bg-action px-2",
            "text-caption text-secondary",
            "transition-colors duration-200 ease-cc hover:border-default hover:text-primary",
          )}
        >
          {period}
          <ChevronDown className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3.5 flex items-end gap-2">
        <span className="text-metric tabular-nums text-primary">{score}%</span>
        {delta !== undefined && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 text-caption",
              rising ? "text-success" : "text-critical",
            )}
          >
            <DeltaIcon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            <span className="tabular-nums">{Math.abs(delta)}</span>
            <span className="sr-only">{rising ? "increase" : "decrease"} vs previous period</span>
          </span>
        )}
      </div>

      <div
        className="mt-3.5 flex h-1.5 gap-[3px]"
        role="img"
        aria-label={`${summary} of ${total} ${entityLabel}`}
      >
        {segments.map((seg) => (
          <div
            key={seg.tone}
            className={cn("h-full rounded-cc-pill", toneFill[seg.tone])}
            // Proportional, but with a floor: at 1-in-300 a true-to-scale
            // critical segment would round away to nothing.
            style={{ flexGrow: seg.value, minWidth: seg.value > 0 ? 18 : 0 }}
          />
        ))}
      </div>

      <ul className="mt-3.5 space-y-1.5">
        {segments.map((seg) => (
          <li key={seg.tone} className="flex items-center gap-2 text-body-sm">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", toneFill[seg.tone])}
              aria-hidden="true"
            />
            <span className="text-secondary">{seg.label}:</span>
            <span className="tabular-nums text-primary">{seg.value}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAction}
        className={cn(
          "mt-4 flex h-8 w-full items-center justify-center rounded-cc-md",
          "border border-muted bg-action text-label-sm text-secondary",
          "transition-colors duration-200 ease-cc hover:border-default hover:bg-surface-raised-x2 hover:text-primary",
        )}
      >
        {actionLabel}
      </button>
    </article>
  );
}
