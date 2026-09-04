"use client";

import { MapPin, X } from "lucide-react";
import { MetricCard } from "./ui/metric-card";
import { OperatorCard } from "./operator-card";
import { StatusBadge } from "./ui/status-badge";
import { IconButton } from "./ui/icon-button";
import { activeException } from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

interface ExceptionPanelProps {
  /** Rendered as a drawer below `xl`, where it needs its own dismiss control. */
  onClose?: () => void;
  className?: string;
}

const sectionLabel =
  "text-[10px] font-medium uppercase leading-none tracking-[0.09em] text-muted";

export function ExceptionPanel({ onClose, className }: ExceptionPanelProps) {
  const e = activeException;

  return (
    <aside
      aria-label={`${e.id} details`}
      className={cn(
        "flex h-full w-full flex-col border-l border-subtle bg-surface-secondary",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-subtle px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium leading-none text-primary">
            {e.id}: {e.title}
          </h2>
          <div className="mt-2">
            <StatusBadge severity={e.severity} variant="pill" />
          </div>
        </div>
        {onClose && (
          <IconButton label="Close details" size="sm" variant="ghost" onClick={onClose}>
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-secondary">
          <MapPin
            className="mt-px h-3.5 w-3.5 shrink-0 text-muted"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            Exception detected: {e.location}
            <span className="ml-1 text-muted tabular-nums">· {e.detectedAt}</span>
          </span>
        </p>

        {/* Asset preview — a camera or 3D view drops in here later. */}
        <div
          className="flex h-[112px] items-center justify-center rounded-cc-md border border-subtle cc-plate"
          role="img"
          aria-label={`${e.assetType} preview unavailable`}
        >
          <span className="text-[11px] text-muted">{e.assetType}</span>
        </div>

        <section className="space-y-2">
          <h3 className={sectionLabel}>Operator</h3>
          <OperatorCard
            name={e.operator.name}
            initials={e.operator.initials}
            role={e.operator.role}
          />
        </section>

        <section className="space-y-2">
          <h3 className={sectionLabel}>Telemetry Data</h3>
          <div className="rounded-cc-md border border-subtle bg-surface-tertiary px-3 py-2.5">
            <div className="text-[10px] uppercase leading-none tracking-[0.09em] text-muted">
              Primary Issue
            </div>
            <p className="mt-2 text-[12px] leading-[1.4] text-critical">{e.headline}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {e.telemetry.map((t) => (
              <MetricCard key={t.label} {...t} />
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-2 border-t border-subtle px-4 py-3.5">
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-center rounded-cc-md",
            "bg-action-primary text-[13px] font-medium leading-none text-on-light",
            "transition-opacity duration-200 ease-cc hover:opacity-90 active:scale-[0.99]",
          )}
        >
          Confirm Line Stop
        </button>
        <div className="grid grid-cols-2 gap-2">
          {["View Asset", "Raise Work Order"].map((label) => (
            <button
              key={label}
              type="button"
              className={cn(
                "flex h-8 items-center justify-center rounded-cc-md border border-subtle bg-surface-tertiary",
                "px-2 text-[12px] leading-none text-secondary",
                "transition-colors duration-200 ease-cc hover:border-default hover:bg-surface-elevated hover:text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
