"use client";

import { ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { assetHealth, healthScore } from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

const legend = [
  { key: "healthy", label: "Healthy", value: assetHealth.healthy, dot: "bg-feedback-success" },
  { key: "warning", label: "Warning", value: assetHealth.warning, dot: "bg-feedback-warning" },
  { key: "critical", label: "Critical", value: assetHealth.critical, dot: "bg-feedback-critical" },
];

const total = assetHealth.healthy + assetHealth.warning + assetHealth.critical;

/**
 * Floating summary over the plant map. Kept deliberately low-elevation: a thin
 * border and a small shadow, so it sits *on* the map rather than above it.
 */
export function HealthScoreCard({ className }: { className?: string }) {
  return (
    <article className={cn("cc-panel w-[286px] p-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[13px] font-medium leading-none text-primary">Health Score</h2>
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
            "inline-flex h-6 items-center gap-1 rounded-cc-sm border border-subtle bg-surface-tertiary px-2",
            "text-[11px] leading-none text-secondary",
            "transition-colors duration-200 ease-cc hover:border-default hover:text-primary",
          )}
        >
          Today
          <ChevronDown className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-3.5 flex items-end gap-2">
        <span className="text-[38px] font-light leading-[0.85] tracking-[-0.03em] text-primary tabular-nums">
          {healthScore}%
        </span>
        <span className="mb-1 inline-flex items-center gap-0.5 text-[11px] leading-none text-success">
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          <span className="tabular-nums">1.2</span>
        </span>
      </div>

      {/* Segmented bar — proportional, with a floor so 1-of-300 stays visible. */}
      <div
        className="mt-3.5 flex h-1.5 gap-[3px]"
        role="img"
        aria-label={`${assetHealth.healthy} healthy, ${assetHealth.warning} warning, ${assetHealth.critical} critical of ${total} assets`}
      >
        {legend.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full rounded-cc-pill", seg.dot)}
            // Proportional, but with a floor: at 1-in-300 a true-to-scale
            // critical segment would round away to nothing.
            style={{ flexGrow: seg.value, minWidth: seg.value > 0 ? 18 : 0 }}
          />
        ))}
      </div>

      <ul className="mt-3.5 space-y-1.5">
        {legend.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2 text-[12px] leading-none">
            <span className={cn("h-1.5 w-1.5 rounded-full", seg.dot)} aria-hidden="true" />
            <span className="text-secondary">{seg.label}:</span>
            <span className="tabular-nums text-primary">{seg.value}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={cn(
          "mt-4 flex h-8 w-full items-center justify-center rounded-cc-md",
          "border border-subtle bg-surface-tertiary text-[12px] leading-none text-secondary",
          "transition-colors duration-200 ease-cc hover:border-default hover:bg-surface-elevated hover:text-primary",
        )}
      >
        See all assets
      </button>
    </article>
  );
}
