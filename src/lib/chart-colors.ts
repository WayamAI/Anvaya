/**
 * The chart palette.
 *
 * Every value resolves to a CSS custom property declared in globals.css, so a
 * chart follows the active theme without the component subscribing to it —
 * SVG presentation attributes accept `var()`, and the browser re-resolves them
 * when the theme class flips on <html>.
 *
 * The system is one accent plus a neutral ramp. Wayams orange marks the series
 * the reader is meant to follow; everything else recedes into grey. Five
 * shades of orange would make each series shout equally, which is the same as
 * none of them shouting.
 */

export const CHART_COLORS = {
  /** The series under discussion, thresholds, and emphasis marks. */
  primary: "var(--chart-primary-color)",
  /** Comparison bands, targets, "everything else" aggregates. */
  muted: "var(--chart-muted-color)",
  grid: "var(--chart-grid-color)",
  axis: "var(--chart-axis-color)",
} as const;

/**
 * Multi-series order. SERIES[0] is orange and carries the narrative; 1-4 are
 * neutral steps chosen to stay distinguishable from each other in both themes.
 */
export const SERIES = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
] as const;

/** Shared Recharts <Tooltip> chrome, so every tooltip is the same object. */
export const CHART_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "var(--chart-tooltip-bg)",
  color: "hsl(var(--foreground))",
  boxShadow: "none",
} as const;

/** Shared <Legend> chrome. Quiet by default — the chart is the subject. */
export const CHART_LEGEND_STYLE = {
  fontSize: 11,
  color: "hsl(var(--muted-foreground))",
} as const;

/*
 * Retained so the previously theme-specific call sites keep compiling. Both
 * now resolve through the same custom properties, which already switch with
 * the theme, so the "dark" variants are aliases rather than a second palette.
 */
export const CHART_COLORS_DARK = CHART_COLORS;
export const SERIES_DARK = SERIES;
