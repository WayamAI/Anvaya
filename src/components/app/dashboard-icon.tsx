import { cn } from "@/lib/utils";

/**
 * ICON REGISTRY — dashboard figures
 * ----------------------------------------------------------------------------
 * The supplied illustrated icons, bound to the figures they belong to.
 *
 * These are raster assets rather than glyphs, so they live in `public/icons`
 * and are addressed by URL: importing a PNG per card would put seventeen
 * separate static imports through the bundler for images that never change
 * with the code. Components ask for a name here, never for a file path, so
 * re-cutting the set is a change to this map alone.
 *
 * Deliberately separate from `lib/icons.ts`: that registry is the line-art
 * lucide set used for navigation and controls. This one is the illustrated
 * set used only for headline figures, and the two are not interchangeable.
 */
export const DASHBOARD_ICONS = {
  "materials-risk": "/icons/materials-risk.png",
  "purchase-orders": "/icons/purchase-orders.png",
  "schedule-adherence": "/icons/schedule-adherence.png",
  "inventory-health": "/icons/inventory-health.png",
  "pending-work-orders": "/icons/pending-work-orders.png",
  "trace-completeness": "/icons/trace-completeness.png",
  "rca-time": "/icons/rca-time.png",
  "suspect-lots": "/icons/suspect-lots.png",
  "recall-accuracy": "/icons/recall-accuracy.png",
  "material-coverage": "/icons/material-coverage.png",
  "trend-chart": "/icons/trend-chart.png",
  "stock-box": "/icons/stock-box.png",
  "dead-stock": "/icons/dead-stock.png",
  requisitions: "/icons/requisitions.png",
  "planned-pos": "/icons/planned-pos.png",
  "forecast-chart": "/icons/forecast-chart.png",
  "forecast-accuracy": "/icons/forecast-accuracy.png",
  /* Procurement reports and MRP efficiency. Same registry, same `iconName`
     prop — only the folder these particular files were delivered in differs. */
  "total-pos": "/icons/reports/total-pos.png",
  "total-spend": "/icons/reports/total-spend.png",
  "avg-lead-time": "/icons/reports/avg-lead-time.png",
  "cost-savings": "/icons/reports/cost-savings.png",
  "plan-adherence": "/icons/reports/plan-adherence.png",
  "avg-run-duration": "/icons/reports/avg-run-duration.png",
  "exception-resolution": "/icons/reports/exception-resolution.png",
  "open-exceptions": "/icons/reports/open-exceptions.png",

  "total-skus": "/icons/total-skus.png",
  "stock-value": "/icons/stock-value.png",
  "below-reorder-point": "/icons/below-reorder-point.png",
} as const;

export type DashboardIconName = keyof typeof DASHBOARD_ICONS;

/**
 * One illustrated figure icon.
 *
 * The source images are not square and no two share an aspect ratio — they run
 * from 165x187 to 254x192 — so the box is fixed and the artwork is fitted
 * inside it with `object-contain`. Sizing by width alone would leave a tall
 * icon overhanging a wide one and the row would lose its baseline.
 *
 * Decorative by definition: the caption beside it already names the figure, so
 * the image is hidden from assistive technology rather than repeating it.
 */
export function DashboardIcon({
  name,
  className,
}: {
  name: DashboardIconName;
  className?: string;
}) {
  return (
    <img
      src={DASHBOARD_ICONS[name]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("block h-6 w-6 shrink-0 object-contain", className)}
    />
  );
}
