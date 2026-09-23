"use client";

import { AppIcon } from "@/components/ui/app-icon";
import { IconButton } from "@/components/ui/icon-button";
import { MetricCard } from "./metric-card";
import { PersonCard } from "./person-card";
import { StatusBadge } from "./status-badge";
import type { Incident } from "./types";
import { cn } from "@/lib/utils";

interface IncidentPanelProps {
  incident: Incident;
  /** Heading over the person card, e.g. "Driver" or "Operator". */
  personLabel?: string;
  /** Assist line inside the person card. Omit to hide it. */
  assistLabel?: string;
  /** Verb used in the location line, e.g. "Incident detected". */
  detectedLabel?: string;
  primaryAction: string;
  secondaryActions?: [string, string];
  onPrimaryAction?: () => void;
  /** Rendered as a drawer below `xl`, where it needs its own dismiss control. */
  onClose?: () => void;
  className?: string;
}

const sectionLabel = "text-caption font-medium uppercase tracking-[0.09em] text-tertiary";

/**
 * Persistent details panel for the selected incident.
 *
 * Deliberately not a modal: it carries a left border and the container surface
 * so it reads as part of the dashboard frame rather than something floating
 * over it. Below `xl` the shell renders it as a drawer instead.
 */
export function IncidentPanel({
  incident,
  personLabel = "Driver",
  assistLabel,
  detectedLabel = "Incident detected",
  primaryAction,
  secondaryActions,
  onPrimaryAction,
  onClose,
  className,
}: IncidentPanelProps) {
  return (
    <aside
      aria-label={`${incident.id} details`}
      className={cn(
        "flex h-full w-full flex-col border-l border-muted bg-surface-container",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-muted px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-label-md text-primary">
            {incident.id}: {incident.title}
          </h2>
          <div className="mt-2">
            <StatusBadge severity={incident.severity} variant="pill" />
          </div>
        </div>
        {onClose && <IconButton icon="close" label="Close details" size="sm" onClick={onClose} />}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="flex items-start gap-1.5 text-body-sm text-secondary">
          <AppIcon name="location" size="sm" tone="tertiary" className="mt-px" />
          <span>
            {detectedLabel}: {incident.location}
            <span className="ml-1 tabular-nums text-tertiary">· {incident.detectedAt}</span>
          </span>
        </p>

        {/* Preview plate — a camera or 3D view drops in here later. */}
        <div
          className="flex h-[112px] items-center justify-center rounded-cc-md border border-muted cc-plate"
          role="img"
          aria-label={`${incident.subjectType} preview unavailable`}
        >
          <span className="text-caption text-tertiary">{incident.subjectType}</span>
        </div>

        <section className="space-y-2">
          <h3 className={sectionLabel}>{personLabel}</h3>
          <PersonCard {...incident.person} assistLabel={assistLabel} />
        </section>

        <section className="space-y-2">
          <h3 className={sectionLabel}>Telemetry data</h3>
          <div className="rounded-cc-md border border-muted bg-action px-3 py-2.5">
            <div className="text-caption uppercase tracking-[0.09em] text-tertiary">
              Primary issue
            </div>
            <p className="mt-2 text-body-sm text-error">{incident.headline}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {incident.telemetry.map((reading) => (
              <MetricCard key={reading.label} {...reading} />
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-2 border-t border-muted px-4 py-3.5">
        <button
          type="button"
          onClick={onPrimaryAction}
          className={cn(
            "flex h-9 w-full items-center justify-center rounded-cc-md",
            "bg-action-primary text-label-md text-on-color",
            "transition-colors duration-200 ease-cc hover:bg-action-primary-hover active:scale-[0.99]",
          )}
        >
          {primaryAction}
        </button>
        {secondaryActions && (
          <div className="grid grid-cols-2 gap-2">
            {secondaryActions.map((label) => (
              <button
                key={label}
                type="button"
                className={cn(
                  // min-h rather than a fixed height: at 320px a two-word
                  // label like "Raise work order" wraps, and a fixed 32px box
                  // would clip it.
                  "flex min-h-8 items-center justify-center rounded-cc-md border border-muted bg-action",
                  "px-2 py-1.5 text-center text-label-sm leading-tight text-secondary",
                  "transition-colors duration-200 ease-cc hover:border-default hover:bg-surface-raised-x2 hover:text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
