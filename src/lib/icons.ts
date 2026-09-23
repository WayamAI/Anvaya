/**
 * ICON REGISTRY
 * ----------------------------------------------------------------------------
 * The single place where a semantic concept binds to a concrete glyph:
 *
 *   icon source  ->  registry  ->  <AppIcon name="vehicle" />  ->  component
 *
 * Components must not import glyphs directly; they ask for meaning and the
 * registry decides what that looks like. Swapping the underlying icon family
 * is therefore a change to this file alone.
 *
 * Source: lucide-react — a uniform 1.5px-stroke outlined set, which matches the
 * thin/technical icon language the design system calls for. Imports are named
 * (never `import * as`) so the bundle only carries what the registry uses.
 *
 * One concept resolves to exactly one glyph. If two names below ever need the
 * same picture, alias them here rather than picking a different glyph at the
 * call site.
 */

import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  CalendarDays,
  Car,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleUser,
  Cloud,
  Download,
  EllipsisVertical,
  ExternalLink,
  FileText,
  Fuel,
  Gauge,
  House,
  Info,
  Layers,
  LayoutDashboard,
  Link2,
  ListFilter,
  Mail,
  Map,
  MapPin,
  Maximize2,
  Minus,
  Moon,
  Palette,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Route,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

export const icons = {
  // -- Navigation ---------------------------------------------------------
  dashboard: LayoutDashboard,
  vehicle: Car,
  calendar: CalendarDays,
  maintenance: Wrench,
  document: FileText,
  settings: Settings,
  home: House,

  // -- Actions ------------------------------------------------------------
  search: Search,
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  archive: Archive,
  download: Download,
  externalLink: ExternalLink,
  link: Link2,
  mail: Mail,
  refresh: RotateCw,
  close: X,
  check: Check,
  minus: Minus,
  more: EllipsisVertical,
  moreVertical: EllipsisVertical,
  controls: SlidersHorizontal,

  // -- Direction ----------------------------------------------------------
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,

  // -- System -------------------------------------------------------------
  notification: Bell,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
  help: CircleHelp,
  user: CircleUser,
  fullscreen: Maximize2,
  target: Target,
  layers: Layers,
  theme: Moon,
  themeLight: Sun,
  play: Play,
  palette: Palette,
  sparkle: Sparkles,
  cloud: Cloud,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,

  // -- Automotive / fleet -------------------------------------------------
  gauge: Gauge,
  fuel: Fuel,
  road: Route,
  map: Map,
  location: MapPin,

  // -- Data ---------------------------------------------------------------
  chart: ChartColumn,
  sort: ArrowUpDown,
  filter: ListFilter,
  trend: TrendingUp,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;
