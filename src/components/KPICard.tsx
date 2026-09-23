import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardIcon, type DashboardIconName } from "@/components/app/dashboard-icon";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: string; direction: "up" | "down"; positive?: boolean };
  status?: "green" | "amber" | "red";
  /**
   * The illustrated icon for this figure. Takes precedence over `icon`: a
   * card that has been given one of the commissioned assets should not also
   * draw the line-art fallback beside it.
   */
  iconName?: DashboardIconName;
  icon?: React.ElementType;
}

/*
  Status tints the figure, not the card.

  Nine tiles with nine coloured accents give every number equal urgency, which
  is the same as giving none of them any. The surface stays neutral in all
  cases; only a figure that is genuinely off-target takes a colour.
*/
const statusClass: Record<NonNullable<KPICardProps["status"]>, string> = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
};

/**
 * A single headline figure.
 *
 * Shares its surface, caption style and figure size with MetricRow, so pages
 * that lay out KPIs individually and pages that use the row are visually the
 * same system.
 */
export default function KPICard({ title, value, subtitle, trend, status, iconName, icon: Icon }: KPICardProps) {
  return (
    <div className="surface-panel flex min-w-0 flex-col gap-1.5 px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="label-caps truncate" title={title}>
          {title}
        </p>
        {iconName
          ? <DashboardIcon name={iconName} />
          : Icon && <Icon className="block h-4 w-4 shrink-0 text-ink-quaternary" />}
      </div>
      <p
        className={cn(
          "font-display text-display-xl tabular-nums",
          status ? statusClass[status] : "text-foreground",
        )}
      >
        {value}
      </p>
      {subtitle && <p className="truncate text-body-sm text-ink-tertiary">{subtitle}</p>}
      {trend && (
        <p className="flex items-center gap-1 text-body-sm tabular-nums text-ink-tertiary">
          {trend.direction === "up"
            ? <ArrowUp className="block h-3.5 w-3.5 shrink-0" />
            : <ArrowDown className="block h-3.5 w-3.5 shrink-0" />}
          {trend.value}
        </p>
      )}
    </div>
  );
}
