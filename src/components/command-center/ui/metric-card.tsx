import { cn } from "@/lib/utils";
import type { TelemetryReading } from "@/lib/command-center-data";

const tone: Record<TelemetryReading["severity"], string> = {
  critical: "text-critical",
  warning: "text-warning",
  info: "text-muted",
  nominal: "text-primary",
};

/** Single telemetry readout. Values use tabular figures so columns stay aligned. */
export function MetricCard({ label, value, unit, severity, delta }: TelemetryReading) {
  return (
    <div
      className={cn(
        "rounded-cc-md border border-subtle bg-surface-tertiary px-3 py-2.5",
        "cc-inner-highlight transition-colors duration-200 ease-cc hover:border-default",
      )}
    >
      <div className="text-[10px] uppercase leading-none tracking-[0.09em] text-muted">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("text-[19px] font-medium leading-none tabular-nums", tone[severity])}>
          {value}
        </span>
        <span className="text-[11px] leading-none text-muted">{unit}</span>
      </div>
      {delta && (
        <div className="mt-1.5 text-[10px] leading-none tabular-nums text-muted">
          {delta} vs nominal
        </div>
      )}
    </div>
  );
}
