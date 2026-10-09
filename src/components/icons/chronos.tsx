"use client";

import { createContext, useContext, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight, Ban, BarChart3, Bell,
  Box, Building, Calendar, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp,
  Circle, ClipboardList, Clock, Columns3, Database, DollarSign, Download, ExternalLink, Factory, FileBarChart,
  FileText, Filter, Hash, Heart, Info, Layers, LayoutDashboard, LogOut, Mail, MapPin, MessageSquare, Moon,
  MoreHorizontal, Package, PanelLeft, Pause, Play, RefreshCw, RotateCcw, Search, Settings, Shield, ShieldCheck,
  ShoppingCart, Sun, Target, TrendingUp, Truck, User, Users, Wrench, X, Zap,
  type LucideIcon, type LucideProps,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * CHRONOS ICON SET
 * ----------------------------------------------------------------------------
 * The generated 24px line set in `public/icons/chronos/`, drawn as a CSS mask
 * filled with `currentColor`. A mask rather than an <img> so the glyph follows
 * the colour of the text around it exactly as the lucide SVGs did: hover and
 * active states, the status tones (text-warning, text-danger…) and dark mode
 * all keep working, and no call site has to change its colour classes.
 *
 * Each export is a drop-in for the lucide glyph it replaces (same props, same
 * className sizing) and carries that glyph as its fallback. Inside a
 * <LegacyIconScope> the fallback renders instead — that is how the Dashboard,
 * which shares DataTable and the dialogs with every other screen, keeps its
 * existing icons untouched.
 */

const LegacyIconContext = createContext(false);

/** Renders the original lucide icons for everything beneath it. */
export function LegacyIconScope({ children }: { children: ReactNode }) {
  return <LegacyIconContext.Provider value>{children}</LegacyIconContext.Provider>;
}

const HAS_SIZE = /(^|\s)(h|w|size)-/;

function chronos(file: string, Fallback: LucideIcon, base?: string) {
  const url = `url(/icons/chronos/${file}.png)`;
  function ChronosIcon({ className, style, size, color, strokeWidth, absoluteStrokeWidth, ...rest }: LucideProps) {
    const legacy = useContext(LegacyIconContext);
    if (legacy) {
      return (
        <Fallback
          className={className} style={style} size={size} color={color}
          strokeWidth={strokeWidth} absoluteStrokeWidth={absoluteStrokeWidth} {...rest}
        />
      );
    }
    const labelled = rest["aria-label"] !== undefined;
    const mask: CSSProperties = {
      maskImage: url, WebkitMaskImage: url,
      maskSize: "contain", WebkitMaskSize: "contain",
      maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
      maskPosition: "center", WebkitMaskPosition: "center",
      ...(size !== undefined ? { width: size, height: size } : null),
      ...(color ? { color } : null),
      ...style,
    };
    return (
      <span
        {...(rest as unknown as HTMLAttributes<HTMLSpanElement>)}
        role={labelled ? "img" : undefined}
        aria-hidden={labelled ? undefined : true}
        style={mask}
        className={cn(
          "chronos-icon block shrink-0 bg-current",
          size === undefined && !HAS_SIZE.test(className ?? "") && "h-6 w-6",
          base,
          className,
        )}
      />
    );
  }
  ChronosIcon.displayName = `Chronos(${file})`;
  return ChronosIcon;
}

// -- Navigation -----------------------------------------------------------
export const DashboardIcon = chronos("navigation/dashboard", LayoutDashboard);
export const MaterialPlanningIcon = chronos("navigation/material-planning", Layers);
export const ProductionIcon = chronos("navigation/production", Factory);
export const InventoryIcon = chronos("navigation/inventory", Package);
export const PurchaseIcon = chronos("navigation/purchase", ShoppingCart);
export const DemandIcon = chronos("navigation/demand", TrendingUp);
export const SettingsIcon = chronos("navigation/settings", Settings);
export const ReportsIcon = chronos("navigation/reports", FileBarChart);

// -- Screens --------------------------------------------------------------
export const MrpRunIcon = chronos("mrp/mrp-run", Zap);
export const MaterialRequirementsIcon = chronos("mrp/material-requirements", ClipboardList);
export const MaterialCoverageIcon = chronos("mrp/material-coverage", Shield);
export const BomIcon = chronos("mrp/bom", FileText);
export const SafetyStockIcon = chronos("mrp/safety-stock", Shield);
export const StockExhaustionIcon = chronos("mrp/stock-exhaustion", AlertTriangle);
export const ProductionScheduleIcon = chronos("mrp/production-schedule", Calendar);
export const WorkOrderIcon = chronos("mrp/work-order", Wrench);
export const ConstraintsIcon = chronos("mrp/constraints", Factory);
export const ScheduleUpdatesIcon = chronos("mrp/schedule-updates", Calendar);
export const StockOverviewIcon = chronos("inventory/stock-overview", Box);
export const MultiLocationIcon = chronos("inventory/multi-location", MapPin);
export const BatchSerialIcon = chronos("inventory/batch-serial", Hash);
export const InventoryHealthIcon = chronos("inventory/inventory-health", Heart);
export const PurchasePlanningIcon = chronos("procurement/purchase-planning", ClipboardList);
export const PurchaseOrderIcon = chronos("procurement/purchase-order", ShoppingCart);
export const SupplierIcon = chronos("procurement/supplier", Truck);
export const ProcurementAnalyticsIcon = chronos("procurement/procurement-analytics", BarChart3);
export const DemandForecastIcon = chronos("demand/demand-forecast", TrendingUp);
export const ForecastVsActualIcon = chronos("demand/forecast-vs-actual", Target);
export const SalesOrderIcon = chronos("system/sales-order", FileBarChart);
export const TraceabilityIcon = chronos("system/traceability", Shield);
export const CompanyWarehouseIcon = chronos("system/company-warehouse", Building);
export const UsersRolesIcon = chronos("system/users-roles", Users);
export const IntegrationsIcon = chronos("system/integrations", Activity);
export const AlertConfigIcon = chronos("system/alert-config", Bell);
export const BiDashboardIcon = chronos("analytics/bi-dashboard", BarChart3);
export const MrpEfficiencyIcon = chronos("analytics/mrp-efficiency", Target);
export const CustomReportsIcon = chronos("analytics/custom-reports", FileText);

// -- Shell ----------------------------------------------------------------
export const LogoutIcon = chronos("system/logout", LogOut);
export const ThemeDarkIcon = chronos("system/theme-dark", Moon);
export const ThemeLightIcon = chronos("system/theme-light", Sun);
export const SidebarToggleIcon = chronos("system/sidebar-toggle", PanelLeft);
export const UserAccountIcon = chronos("system/user-account", User);

// -- Actions --------------------------------------------------------------
export const AddIcon = chronos("actions/add", Zap);
export const SearchIcon = chronos("actions/search", Search);
export const FilterIcon = chronos("actions/filter", Filter);
export const SortIcon = chronos("actions/sort", ChevronsUpDown);
export const SortAscIcon = chronos("actions/sort-asc", ArrowUp);
export const SortDescIcon = chronos("actions/sort-desc", ArrowDown);
export const DownloadIcon = chronos("actions/download", Download);
export const ApproveIcon = chronos("actions/approve", CheckCircle2);
export const RefreshIcon = chronos("actions/refresh", RefreshCw);
export const RetryIcon = chronos("actions/refresh", RotateCcw);
export const SendIcon = chronos("actions/send", Mail);
export const MessageIcon = chronos("actions/send", MessageSquare);
export const MoreIcon = chronos("actions/more", MoreHorizontal);
export const CloseIcon = chronos("actions/close", X);
export const CheckIcon = chronos("actions/check", Check);
export const ColumnsIcon = chronos("actions/columns", Columns3);
export const ExternalLinkIcon = chronos("actions/external-link", ExternalLink);
export const NotificationIcon = chronos("actions/notification", Bell);
export const SuccessIcon = chronos("actions/success", CheckCircle2);
export const WarningIcon = chronos("actions/warning", AlertTriangle);
export const InfoIcon = chronos("actions/info", Info);
export const PendingIcon = chronos("actions/pending", Clock);
export const BlockedIcon = chronos("actions/blocked", Ban);
export const CalendarIcon = chronos("actions/calendar", Calendar);
export const PlayIcon = chronos("actions/play", Play);
export const PauseIcon = chronos("actions/pause", Pause);
export const DotIcon = chronos("actions/more", Circle);

// Direction: the source chevron and arrows point right; the others are rotations.
export const ChevronRightIcon = chronos("actions/chevron", ChevronRight);
export const ChevronDownIcon = chronos("actions/chevron", ChevronDown, "rotate-90");
export const ChevronLeftIcon = chronos("actions/chevron", ChevronLeft, "rotate-180");
export const ChevronUpIcon = chronos("actions/chevron", ChevronUp, "-rotate-90");
export const ArrowRightIcon = chronos("actions/arrow", ArrowRight);
export const ArrowUpRightIcon = chronos("actions/arrow-diagonal", ArrowUpRight);
export const ArrowDownRightIcon = chronos("actions/arrow-diagonal", ArrowDownRight, "rotate-90");

// -- Domain ---------------------------------------------------------------
export const RawMaterialIcon = chronos("manufacturing/raw-material", Package);
export const FinishedGoodIcon = chronos("manufacturing/finished-good", Package);
export const QualityInspectionIcon = chronos("manufacturing/quality-inspection", ShieldCheck);
export const QcReleaseIcon = chronos("manufacturing/qc-release", Shield);
export const QcHoldIcon = chronos("manufacturing/qc-hold", Ban);
export const ExceptionIcon = chronos("manufacturing/exception", AlertTriangle);
export const LeadTimeIcon = chronos("manufacturing/lead-time", Clock);
export const ShipmentIcon = chronos("manufacturing/shipment", Truck);
export const CostIcon = chronos("manufacturing/cost", DollarSign);
export const MaterialMasterIcon = chronos("manufacturing/raw-material", Package);
export const CustomerIcon = chronos("system/user-account", User);
export const LotIcon = chronos("manufacturing/lot", Package);
export const DatabaseIcon = chronos("manufacturing/supply", Database);
