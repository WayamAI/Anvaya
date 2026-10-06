import type { ElementType } from "react";
import {
  AlertTriangle, Box, Building, Calendar, ClipboardList, Factory, FileBarChart, FileText, Hash, Heart, Layers, LayoutDashboard, LogOut, MapPin, Moon, Package, Settings, Shield, ShoppingCart, TrendingUp, Truck, Users, Wrench, Zap,
} from "lucide-react";

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
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
];

export const navSections: NavSection[] = [
  {
    label: "Material planning",
    icon: Layers,
    items: [
      { label: "MRP run & results", path: "/mrp-run", icon: Zap },
      { label: "Material requirements", path: "/material-requirements", icon: ClipboardList },
      { label: "Material coverage", path: "/material-coverage", icon: Shield },
      { label: "BOM management", path: "/bom-management", icon: FileText },
      { label: "Safety stock", path: "/safety-stock", icon: Shield },
      { label: "Stock exhaustion alerts", path: "/stock-alerts", icon: AlertTriangle },
    ],
  },
  {
    label: "Production",
    icon: Factory,
    items: [
      { label: "Production schedule", path: "/production-schedule", icon: Calendar },
      { label: "Work orders", path: "/work-orders", icon: Wrench },
    ],
  },
  {
    label: "Inventory",
    icon: Package,
    items: [
      { label: "Stock overview", path: "/stock-overview", icon: Box },
      { label: "Multi-location", path: "/multi-location", icon: MapPin },
      { label: "Batch & serial tracking", path: "/batch-tracking", icon: Hash },
      { label: "Inventory health", path: "/inventory-health", icon: Heart },
    ],
  },
  {
    label: "Purchase",
    icon: ShoppingCart,
    items: [
      { label: "Purchase planning", path: "/purchase-planning", icon: ClipboardList },
      { label: "Purchase orders", path: "/purchase-orders", icon: ShoppingCart },
      { label: "Vendor management", path: "/vendor-management", icon: Truck },
    ],
  },
  {
    label: "Demand",
    icon: TrendingUp,
    items: [
      { label: "Sales order intake", path: "/sales-orders", icon: FileBarChart },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { label: "Company & warehouses", path: "/company-settings", icon: Building },
      { label: "Users & roles", path: "/users-roles", icon: Users },
      { label: "theme-toggle", path: "", icon: Moon },
      { label: "Logout", path: "", icon: LogOut },
    ],
  },
];

/** Every route the menu links to, for the access-rule test. */
export const navPaths = () => [...topNavItems, ...navSections.flatMap((s) => s.items)].map((i) => i.path).filter(Boolean);
