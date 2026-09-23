"use client";

import { useState } from "react";

import { CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";

/**
 * Shared recharts settings.
 *
 * Every chart in the product previously picked its own margins and tick sizes,
 * which is how axis labels ended up clipped on some pages and not others. The
 * left margin is zero and the y-axis reserves its own width instead: a
 * negative margin pulls the axis into its own gutter and cuts the labels off.
 *
 * These live apart from `components/app/chart-card` on purpose — a module that
 * exports both components and plain values loses fast refresh.
 */
export const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 } as const;

export const axisProps = {
  tick: { fontSize: 11, fill: CHART_COLORS.axis },
  tickLine: false,
  axisLine: false,
  tickMargin: 6,
} as const;

export const gridProps = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/** Tooltip that always states the unit, so a bare number is never ambiguous. */
export function tooltipProps(unit = "") {
  return {
    contentStyle: CHART_TOOLTIP_STYLE,
    cursor: { stroke: CHART_COLORS.grid, strokeWidth: 1 },
    formatter: (v: number | string) => `${typeof v === "number" ? v.toLocaleString() : v}${unit}`,
  };
}

/**
 * Legend state for charts with more than one series.
 *
 * Returns the set of hidden series plus the click handler recharts expects, so
 * a reader can isolate one line in a crowded chart instead of squinting at it.
 */
export function useSeriesToggle(all: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const onLegendClick = (data: { dataKey?: unknown }, _index?: number, _event?: unknown) => {
    const key = String(data?.dataKey ?? "");
    if (!key) return;
    setHidden((h) => {
      const next = new Set(h);
      // Never let the last visible series be switched off — an empty chart
      // looks broken rather than filtered.
      if (next.has(key)) next.delete(key);
      else if (all.length - next.size > 1) next.add(key);
      return next;
    });
  };

  return {
    hidden,
    isHidden: (key: string) => hidden.has(key),
    onLegendClick,
    legendProps: {
      onClick: onLegendClick,
      wrapperStyle: { cursor: "pointer", fontSize: 12, paddingTop: 8 },
    },
  };
}
