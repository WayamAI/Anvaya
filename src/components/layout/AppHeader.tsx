"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight } from "lucide-react";

const routeLabels: Record<string, string[]> = {
  "/": ["Dashboard"],
  "/mrp-run": ["Material planning", "MRP run & results"],
  "/material-requirements": ["Material planning", "Material requirements"],
  "/bom-management": ["Material planning", "BOM management"],
  "/safety-stock": ["Material planning", "Safety stock management"],
  "/stock-alerts": ["Material planning", "Stock exhaustion alerts"],
  "/production-schedule": ["Production", "Production schedule"],
  "/work-orders": ["Production", "Work orders"],
  "/production-constraints": ["Production", "Production constraints"],
  "/schedule-updates": ["Production", "Schedule updates"],
  "/stock-overview": ["Inventory", "Stock overview"],
  "/multi-location": ["Inventory", "Multi-location inventory"],
  "/batch-tracking": ["Inventory", "Batch & serial tracking"],
  "/inventory-health": ["Inventory", "Inventory health scoring"],
  "/purchase-planning": ["Purchase", "Purchase planning"],
  "/purchase-orders": ["Purchase", "Purchase orders"],
  "/vendor-management": ["Purchase", "Vendor management"],
  "/procurement-analytics": ["Purchase", "Procurement cycle analytics"],
  "/demand-forecast": ["Forecasting", "Demand forecast"],
  "/forecast-actuals": ["Forecasting", "Forecast vs. actuals"],
  "/sales-orders": ["Forecasting", "Sales order intake"],
  "/traceability": ["Traceability"],
  "/bi-dashboard": ["Analytics", "BI dashboard"],
  "/material-coverage": ["Analytics", "Material coverage monitor"],
  "/procurement-reports": ["Analytics", "Procurement reports"],
  "/mrp-efficiency": ["Analytics", "MRP efficiency metrics"],
  "/custom-reports": ["Analytics", "Custom reports"],
  "/company-settings": ["Settings", "Company & warehouses"],
  "/users-roles": ["Settings", "Users & roles"],
  "/integrations": ["Settings", "Integrations"],
  "/alert-config": ["Settings", "Alert configuration"],
};

/**
 * The application bar.
 *
 * Deliberately thin and almost empty: it carries location and nothing else.
 * Identity now lives at the foot of the rail, and page-level titles and
 * actions belong to PageHeader, so the two never compete and the bar stays the
 * same height on every route.
 */
export default function AppHeader() {
  const pathname = usePathname();
  const crumbs = routeLabels[pathname] || ["Dashboard"];

  return (
    /*
      The bar sits on the page surface, not on a container, so the white rail
      and the white cards below both read as things placed on it.
    */
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-5">
      {/*
        Location, set as an eyebrow and a title rather than as a row of equal
        crumbs: the ancestors are context and the last one is where you are,
        and typography can say that without a separator doing the work. The
        trail is still a single nav with the same links it always had.
      */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-baseline gap-3">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          if (isLast) {
            return (
              <span
                key={i}
                aria-current="page"
                className="truncate font-display text-display-lg text-foreground"
              >
                {crumb}
              </span>
            );
          }
          return (
            <span key={i} className="flex min-w-0 items-center gap-3">
              <span className="label-caps truncate">{crumb}</span>
              {i > 0 && <ChevronRight className="block h-3.5 w-3.5 shrink-0 text-ink-quaternary" />}
            </span>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-ink-tertiary transition-colors hover:border-input hover:bg-sunken hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
        >
          <Bell className="block h-[15px] w-[15px]" />
        </button>
      </div>
    </header>
  );
}
