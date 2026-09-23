import { cn } from "@/lib/utils";
import type { TelemetryReading, TelemetrySeverity } from "./types";

const tone: Record<TelemetrySeverity, string> = {
  critical: "text-error",
  warning: "text-warning",
  info: "text-tertiary",
  nominal: "text-primary",
};

/**
 * Single telemetry readout.
 *
 * A dense readout rather than a headline figure, so the value stays on the
 * functional type scale.
 */
export function MetricCard({ label, value, unit, severity, delta }: TelemetryReading) {
  return (
    <div
      className={cn(
        "rounded-cc-md border border-muted bg-action px-3 py-2.5",
        "cc-inner-highlight transition-colors duration-200 ease-cc hover:border-default",
      )}
    >
      <div className="text-caption uppercase tracking-[0.09em] text-tertiary">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("text-heading-md tabular-nums", tone[severity])}>{value}</span>
        <span className="text-caption text-tertiary">{unit}</span>
      </div>
      {delta && (
        <div className="mt-1.5 text-caption tabular-nums text-tertiary">{delta} vs nominal</div>
      )}
    </div>
  );
}
