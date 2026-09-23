import { cn } from "@/lib/utils";
import { DashboardIcon, type DashboardIconName } from "@/components/app/dashboard-icon";

export interface Metric {
  label: string;
  value: string | number;
  /** The illustrated icon for this figure, drawn opposite the caption. */
  iconName?: DashboardIconName;
  /** Supporting line, e.g. "6 overdue" or "Below 80 target". */
  hint?: string;
  /** Small delta, e.g. "+2.1%". */
  delta?: string;
  deltaDirection?: "up" | "down";
  /** Marks the figure as needing attention. Use for one or two, never all. */
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

/*
  Tone colours the figure only — never the tile.

  A card with a coloured fill or a coloured left border reads as a category,
  not as a state, and once every tile has one the row becomes decoration. Here
  the surface is identical across the row and the number itself carries the
  signal, so a red figure means something is wrong rather than "this tile is
  the red one".
*/
const toneClass: Record<NonNullable<Metric["tone"]>, string> = {
  default: "text-foreground",
  accent: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * A row of headline figures.
 *
 * Each figure is its own bordered tile on a recessed fill, sized so the number
 * dominates and the caption recedes: small caps label, large regular-weight
 * value, quiet supporting line. The tiles share one surface treatment so the
 * row reads as a single instrument cluster.
 */
export function MetricRow({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-3",
        "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className,
      )}
    >
      {metrics.map((m) => (
        <div key={m.label} className="surface-panel flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
          {/* Caption and icon share a line, matching KPICard, so a page that
              mixes the two lays out on the same grid. */}
          <div className="flex items-start justify-between gap-2">
            <dt className="label-caps truncate" title={m.label}>
              {m.label}
            </dt>
            {m.iconName && <DashboardIcon name={m.iconName} />}
          </div>
          <dd className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-display-xl tabular-nums",
                toneClass[m.tone ?? "default"],
              )}
            >
              {m.value}
            </span>
            {m.delta && (
              <span className="text-body-sm tabular-nums text-ink-tertiary">
                {m.deltaDirection === "down" ? "↓" : "↑"} {m.delta}
              </span>
            )}
          </dd>
          {m.hint && <p className="truncate text-body-sm text-ink-tertiary">{m.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
