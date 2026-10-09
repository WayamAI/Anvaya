"use client";

import type { ElementType } from "react";
import { usePathname } from "next/navigation";

import {
  AlertConfigIcon, CustomerIcon, MaterialMasterIcon, BatchSerialIcon, BiDashboardIcon, BomIcon, CompanyWarehouseIcon, ConstraintsIcon, CustomReportsIcon,
  DemandForecastIcon, ForecastVsActualIcon, IntegrationsIcon, InventoryHealthIcon, MaterialCoverageIcon,
  MaterialRequirementsIcon, MrpEfficiencyIcon, MrpRunIcon, MultiLocationIcon, ProcurementAnalyticsIcon,
  ProductionScheduleIcon, PurchaseOrderIcon, PurchasePlanningIcon, ReportsIcon, SafetyStockIcon, SalesOrderIcon,
  ScheduleUpdatesIcon, StockExhaustionIcon, StockOverviewIcon, SupplierIcon, TraceabilityIcon, UsersRolesIcon,
  WorkOrderIcon,
} from "@/components/icons/chronos";
import { cn } from "@/lib/utils";

/**
 * ICON REGISTRY — pages
 * ----------------------------------------------------------------------------
 * The Chronos glyph that sits before each page title, bound to its route — the
 * same glyph the sidebar uses for that screen, so a page and its menu entry
 * read as one thing.
 *
 * Keyed by route rather than by title: the route is what the router already
 * uses, and a title is the likelier thing to get reworded. A page with no
 * entry renders nothing at all, so an unmapped screen loses the mark rather
 * than the heading. The Dashboard ("/") is deliberately absent.
 */
const PAGE_ICONS: Record<string, ElementType> = {
  "/mrp-run": MrpRunIcon,
  "/material-requirements": MaterialRequirementsIcon,
  "/bom-management": BomIcon,
  "/safety-stock": SafetyStockIcon,
  "/stock-alerts": StockExhaustionIcon,

  "/production-schedule": ProductionScheduleIcon,
  "/work-orders": WorkOrderIcon,
  "/production-constraints": ConstraintsIcon,
  "/schedule-updates": ScheduleUpdatesIcon,

  "/materials": MaterialMasterIcon,
  "/stock-overview": StockOverviewIcon,
  "/multi-location": MultiLocationIcon,
  "/batch-tracking": BatchSerialIcon,
  "/inventory-health": InventoryHealthIcon,
  "/traceability": TraceabilityIcon,

  "/purchase-planning": PurchasePlanningIcon,
  "/purchase-orders": PurchaseOrderIcon,
  "/vendor-management": SupplierIcon,
  "/procurement-analytics": ProcurementAnalyticsIcon,

  "/demand-forecast": DemandForecastIcon,
  "/forecast-actuals": ForecastVsActualIcon,
  "/sales-orders": SalesOrderIcon,
  "/customers": CustomerIcon,

  "/bi-dashboard": BiDashboardIcon,
  "/material-coverage": MaterialCoverageIcon,
  "/procurement-reports": ReportsIcon,
  "/mrp-efficiency": MrpEfficiencyIcon,
  "/custom-reports": CustomReportsIcon,

  "/company-settings": CompanyWarehouseIcon,
  "/users-roles": UsersRolesIcon,
  "/integrations": IntegrationsIcon,
  "/alert-config": AlertConfigIcon,
};

/**
 * The mark that sits before a page title.
 *
 * Resolves itself from the current route, so a page opts in by rendering it
 * rather than by knowing which glyph it needs. The 28px box is the one the
 * title row was laid out around; the 20px glyph is centred inside it.
 *
 * Decorative: the title beside it says the same thing.
 */
export function PageIcon({ className }: { className?: string }) {
  const pathname = usePathname();
  const Icon = PAGE_ICONS[pathname];
  if (!Icon) return null;

  return (
    <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center text-foreground", className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}
