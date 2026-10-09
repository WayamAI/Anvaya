import type { ElementType } from "react";
import {
  BatchSerialIcon, BomIcon, CustomerIcon, MaterialMasterIcon, CompanyWarehouseIcon, DashboardIcon, DemandIcon, InventoryHealthIcon, InventoryIcon, LogoutIcon,
  MaterialCoverageIcon, MaterialPlanningIcon, MaterialRequirementsIcon, MrpRunIcon, MultiLocationIcon, ProductionIcon,
  ProductionScheduleIcon, PurchaseIcon, PurchaseOrderIcon, PurchasePlanningIcon, SafetyStockIcon, SalesOrderIcon, SettingsIcon,
  StockExhaustionIcon, StockOverviewIcon, SupplierIcon, ThemeDarkIcon, UsersRolesIcon, WorkOrderIcon,
} from "@/components/icons/chronos";

/**
 * The sidebar's menu: screens grouped by area. Which a user sees is nav-access's call.
 * Only screens backed by real data are listed; the unfinished ones answer 404.
 */

export interface NavItem {
  label: string;
  path: string;
  icon: ElementType;
  badge?: number;
}

export interface NavSection {
  label: string;
  icon: ElementType;
  items: NavItem[];
}

export const topNavItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: DashboardIcon },
];

export const navSections: NavSection[] = [
  {
    label: "Material planning",
    icon: MaterialPlanningIcon,
    items: [
      { label: "MRP run & results", path: "/mrp-run", icon: MrpRunIcon },
      { label: "Material requirements", path: "/material-requirements", icon: MaterialRequirementsIcon },
      { label: "Material coverage", path: "/material-coverage", icon: MaterialCoverageIcon },
      { label: "BOM management", path: "/bom-management", icon: BomIcon },
      { label: "Safety stock", path: "/safety-stock", icon: SafetyStockIcon },
      { label: "Stock exhaustion alerts", path: "/stock-alerts", icon: StockExhaustionIcon },
    ],
  },
  {
    label: "Production",
    icon: ProductionIcon,
    items: [
      { label: "Production schedule", path: "/production-schedule", icon: ProductionScheduleIcon },
      { label: "Work orders", path: "/work-orders", icon: WorkOrderIcon },
    ],
  },
  {
    label: "Inventory",
    icon: InventoryIcon,
    items: [
      { label: "Materials", path: "/materials", icon: MaterialMasterIcon },
      { label: "Stock overview", path: "/stock-overview", icon: StockOverviewIcon },
      { label: "Multi-location", path: "/multi-location", icon: MultiLocationIcon },
      { label: "Batch & serial tracking", path: "/batch-tracking", icon: BatchSerialIcon },
      { label: "Inventory health", path: "/inventory-health", icon: InventoryHealthIcon },
    ],
  },
  {
    label: "Purchase",
    icon: PurchaseIcon,
    items: [
      { label: "Purchase planning", path: "/purchase-planning", icon: PurchasePlanningIcon },
      { label: "Purchase orders", path: "/purchase-orders", icon: PurchaseOrderIcon },
      { label: "Vendor management", path: "/vendor-management", icon: SupplierIcon },
    ],
  },
  {
    label: "Demand",
    icon: DemandIcon,
    items: [
      { label: "Sales order intake", path: "/sales-orders", icon: SalesOrderIcon },
      { label: "Customers", path: "/customers", icon: CustomerIcon },
    ],
  },
  {
    label: "Settings",
    icon: SettingsIcon,
    items: [
      { label: "Company & warehouses", path: "/company-settings", icon: CompanyWarehouseIcon },
      { label: "Users & roles", path: "/users-roles", icon: UsersRolesIcon },
      { label: "theme-toggle", path: "", icon: ThemeDarkIcon },
      { label: "Logout", path: "", icon: LogoutIcon },
    ],
  },
];

/** Every route the menu links to, for the access-rule test. */
export const navPaths = () => [...topNavItems, ...navSections.flatMap((s) => s.items)].map((i) => i.path).filter(Boolean);
