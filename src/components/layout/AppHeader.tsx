"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, User } from "lucide-react";

const routeLabels: Record<string, string[]> = {
  "/": ["Dashboard"],
  "/mrp-run": ["Material Planning", "MRP Run & Results"],
  "/material-requirements": ["Material Planning", "Material Requirements"],
  "/bom-management": ["Material Planning", "BOM Management"],
  "/safety-stock": ["Material Planning", "Safety Stock Management"],
  "/stock-alerts": ["Material Planning", "Stock Exhaustion Alerts"],
  "/production-schedule": ["Production", "Production Schedule"],
  "/work-orders": ["Production", "Work Orders"],
  "/production-constraints": ["Production", "Production Constraints"],
  "/schedule-updates": ["Production", "Schedule Updates"],
  "/stock-overview": ["Inventory", "Stock Overview"],
  "/multi-location": ["Inventory", "Multi-Location Inventory"],
  "/batch-tracking": ["Inventory", "Batch & Serial Tracking"],
  "/inventory-health": ["Inventory", "Inventory Health Scoring"],
  "/purchase-planning": ["Purchase", "Purchase Planning"],
  "/purchase-orders": ["Purchase", "Purchase Orders"],
  "/vendor-management": ["Purchase", "Vendor Management"],
  "/procurement-analytics": ["Purchase", "Procurement Cycle Analytics"],
  "/demand-forecast": ["Forecasting", "Demand Forecast"],
  "/forecast-actuals": ["Forecasting", "Forecast vs. Actuals"],
  "/sales-orders": ["Forecasting", "Sales Order Intake"],
  "/traceability": ["Traceability"],
  "/bi-dashboard": ["Analytics", "BI Dashboard"],
  "/material-coverage": ["Analytics", "Material Coverage Monitor"],
  "/procurement-reports": ["Analytics", "Procurement Reports"],
  "/mrp-efficiency": ["Analytics", "MRP Efficiency Metrics"],
  "/custom-reports": ["Analytics", "Custom Reports"],
  "/company-settings": ["Settings", "Company & Warehouses"],
  "/users-roles": ["Settings", "Users & Roles"],
  "/integrations": ["Settings", "Integrations"],
  "/alert-config": ["Settings", "Alert Configuration"],
};

export default function AppHeader() {
  const pathname = usePathname();
  const crumbs = routeLabels[pathname] || ["Dashboard"];

  // Read after mount: localStorage is not available during server rendering,
  // and reading it inline would desync the first client paint.
  const [identity, setIdentity] = useState({ email: "guest@matrixops.in", role: "admin" });
  useEffect(() => {
    setIdentity({
      email: localStorage.getItem("matrixops_email") || "guest@matrixops.in",
      role: localStorage.getItem("matrixops_role") || "admin",
    });
  }, []);
  const { email, role } = identity;

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}>
              {crumb}
            </span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4">
          <button className="p-1.5 rounded-md hover:bg-secondary transition-colors">
            <Bell className="w-4.5 h-4.5 text-muted-foreground" />
          </button>
        <div className="flex items-center gap-3 pl-3 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="text-left min-w-0">
            <div className="text-sm font-medium truncate">{email}</div>
            <div className="text-[11px] text-muted-foreground capitalize">{role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
