// Centralized Wayams orange chart palette
// Multi-series: orange = primary focus, grays = secondary/tertiary
// All charts use these colors for visual consistency.

export const CHART_COLORS = {
  primary: "hsl(24, 100%, 52%)",
  muted: "hsl(0, 0%, 80%)",
  grid: "hsl(0, 0%, 92%)",
  axis: "hsl(0, 0%, 55%)",
} as const;

// Single-series: use primary directly
// Multi-series: SERIES[0] = orange (highlight), SERIES[1..] = grays
export const SERIES = [
  "hsl(24, 100%, 52%)",
  "hsl(0, 0%, 70%)",
  "hsl(0, 0%, 82%)",
  "hsl(0, 0%, 60%)",
  "hsl(0, 0%, 50%)",
] as const;

// Dark mode variants
export const CHART_COLORS_DARK = {
  primary: "hsl(24, 100%, 58%)",
  muted: "hsl(0, 0%, 22%)",
  grid: "hsl(0, 0%, 16%)",
  axis: "hsl(0, 0%, 55%)",
} as const;

export const SERIES_DARK = [
  "hsl(24, 100%, 58%)",
  "hsl(0, 0%, 50%)",
  "hsl(0, 0%, 35%)",
  "hsl(0, 0%, 60%)",
  "hsl(0, 0%, 45%)",
] as const;
