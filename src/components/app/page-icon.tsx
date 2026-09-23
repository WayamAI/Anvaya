"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * ICON REGISTRY — pages
 * ----------------------------------------------------------------------------
 * The illustrated icons, bound to the page each one depicts.
 *
 * These assets are page-scoped, not metric-scoped: "BOM management" and
 * "Users & roles" name whole screens, not figures on them. So the one place
 * in the content area they map onto cleanly is the page's own title, which is
 * also where the reference product puts its illustrative mark.
 *
 * Keyed by route rather than by title: the route is what the router already
 * uses, and a title is the likelier thing to get reworded. A page with no
 * entry renders nothing at all, so an unmapped screen loses the mark rather
 * than the heading.
 *
 * Deliberately separate from `lib/icons.ts`, which is the lucide line-art set
 * used for navigation and controls. These are raster and illustrated, legible
 * only at size, and the two are not interchangeable — in particular they do
 * not belong in the rail, where the glyph is 14px.
 */
const PAGE_ICONS: Record<string, string> = {
  "/mrp-run": "mrp-run-results",
  "/material-requirements": "material-requirements",
  "/bom-management": "bom-management",
  "/safety-stock": "safety-stock",
  "/stock-alerts": "stock-exhaustion-alerts",

  "/production-schedule": "production-schedule",
  "/work-orders": "work-orders",
  "/production-constraints": "constraints",
  "/schedule-updates": "schedule-updates",

  "/stock-overview": "stock-overview",
  "/multi-location": "multi-location",
  "/batch-tracking": "batch-serial-tracking",
  "/inventory-health": "inventory-health",

  "/purchase-planning": "purchase-planning",
  "/purchase-orders": "purchase-orders",
  "/vendor-management": "vendor-management",
  "/procurement-analytics": "procurement-analytics",

  "/demand-forecast": "demand-forecast",
  "/forecast-actuals": "forecasts-vs-actual",
  "/sales-orders": "sales-order-intake",

  "/bi-dashboard": "bi-dashboard",
  "/material-coverage": "material-coverage",
  "/procurement-reports": "procurement-reports",
  "/mrp-efficiency": "mrp-efficiency",
  "/custom-reports": "custom-reports",

  "/company-settings": "company-warehouses",
  "/users-roles": "users-roles",
  "/integrations": "integrations",
  "/alert-config": "alert-configuration",
};

/**
 * The illustrated mark that sits before a page title.
 *
 * Resolves itself from the current route, so a page opts in by rendering it
 * rather than by knowing which file it needs.
 *
 * The source renders are all different shapes, so the box is fixed and the
 * artwork is fitted inside it — sizing by width alone would leave a tall icon
 * overhanging a wide one and titles would not start on a common line.
 *
 * Decorative: the title beside it says the same thing, so it is hidden from
 * assistive technology rather than repeating it.
 */
export function PageIcon({ className }: { className?: string }) {
  const pathname = usePathname();
  const icon = PAGE_ICONS[pathname];
  if (!icon) return null;

  return (
    <img
      src={`/icons/pages/${icon}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("block h-7 w-7 shrink-0 object-contain", className)}
    />
  );
}
