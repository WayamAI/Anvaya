"use client";

import { cn } from "@/lib/utils";

/**
 * The frame every chart sits in.
 *
 * Charts across the product each carried their own heading markup, their own
 * idea of how much room an axis needs, and no statement of what the numbers
 * are counted in. This gives them one head — label, unit, optional range
 * control — and one body, so a page of six charts reads as one instrument
 * rather than six.
 *
 * The chart itself stays the caller's: this component draws no data. It only
 * standardises the container, which is what keeps "improve the charts" from
 * turning into "replace the charts".
 */
export function ChartCard({
  title,
  unit,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  /** What the figures are counted in, e.g. "₹L" or "% adherence". */
  unit?: string;
  /** Short qualifier, e.g. "Last 12 months". */
  hint?: string;
  /** Range picker or legend toggle, right-aligned in the head. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-panel min-w-0", className)}>
      <div className="panel-head flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="label-caps break-words">
            {title}
            {unit && <span className="ml-1.5 normal-case tracking-normal">({unit})</span>}
          </p>
          {hint && <p className="mt-1 text-body-sm text-ink-tertiary">{hint}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * A range picker for charts whose data is a series over time.
 *
 * Presented as the same pill segmented control the rest of the product uses.
 * The caller owns the windowing, because only it knows how its data is keyed.
 */
export function RangePicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-border bg-secondary p-0.5" role="group" aria-label="Time range">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-label-sm transition-colors",
            value === o
              ? "bg-primary text-primary-foreground"
              : "text-ink-tertiary hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
