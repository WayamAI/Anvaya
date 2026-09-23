"use client";

import { useEffect, useState } from "react";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Layers, Factory, Package, ShoppingCart,
  TrendingUp, BarChart3, Settings, ChevronDown, ChevronRight,
  Zap, ClipboardList, Shield, Box, Truck, FileText,
  AlertTriangle, Calendar, Wrench, MapPin, Hash,
  Heart, LineChart, Target, PieChart, FileBarChart,
  Building, Users, Link2, Bell, Search,
  LogOut, Moon, Sun, User, ShieldCheck
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: number;
}

interface NavSection {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const topNavItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Traceability", path: "/traceability", icon: Search },
];

const navSections: NavSection[] = [
  {
    label: "Material planning",
    icon: Layers,
    items: [
      { label: "MRP run & results", path: "/mrp-run", icon: Zap },
      { label: "Material requirements", path: "/material-requirements", icon: ClipboardList },
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
      { label: "Constraints", path: "/production-constraints", icon: AlertTriangle },
      { label: "Schedule updates", path: "/schedule-updates", icon: Target },
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
      { label: "Procurement analytics", path: "/procurement-analytics", icon: PieChart },
    ],
  },
  {
    label: "Demand & forecasting",
    icon: TrendingUp,
    items: [
      { label: "Demand forecast", path: "/demand-forecast", icon: TrendingUp },
      { label: "Forecast vs. actuals", path: "/forecast-actuals", icon: LineChart },
      { label: "Sales order intake", path: "/sales-orders", icon: FileBarChart },
    ],
  },
  {
    label: "Analytics & reports",
    icon: BarChart3,
    items: [
      { label: "BI dashboard", path: "/bi-dashboard", icon: BarChart3 },
      { label: "Material coverage", path: "/material-coverage", icon: Shield },
      { label: "Procurement reports", path: "/procurement-reports", icon: FileText },
      { label: "MRP efficiency", path: "/mrp-efficiency", icon: Target },
      { label: "Custom reports", path: "/custom-reports", icon: FileBarChart },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { label: "Company & warehouses", path: "/company-settings", icon: Building },
      { label: "Users & roles", path: "/users-roles", icon: Users },
      { label: "Integrations", path: "/integrations", icon: Link2 },
      { label: "Alert configuration", path: "/alert-config", icon: Bell },
      { label: "theme-toggle", path: "", icon: Moon },
      { label: "Logout", path: "", icon: LogOut },
    ],
  },
];

/** Remembered for the length of a tab. A brand-new session opens collapsed. */
const COLLAPSE_KEY = "anvaya-sidebar-collapsed";

/* ---------------------------------------------------------------------------
   Rail control styling

   The disc is the constant. A control is a 36px circle with the glyph centred
   in it, and that circle is the same object in both states — collapsed it is
   the whole control, expanded it gains a label to its right. Because the disc
   never changes size or position, opening the rail reads as text arriving
   next to the icons rather than as the icons being rebuilt.

   Active state lives on the disc: it fills near-black with a white glyph. The
   row behind it stays empty. One filled circle in a column of thirty is
   unmissable, and it costs the rail no extra chrome to say so.
   --------------------------------------------------------------------------- */

const discBase =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
  "transition-colors duration-200 ease-out";

/* Inactive discs keep a faint neutral fill rather than going fully
   transparent, so the column reads as a row of instruments even at rest. */
const discIdle =
  "bg-secondary text-ink-tertiary group-hover:bg-sunken group-hover:text-foreground";

const discActive = "bg-primary text-primary-foreground";

/* The control that wraps the disc: a hit target and a focus ring, no fill of
   its own in either state. */
const controlBase =
  "group relative flex items-center rounded-full outline-none " +
  "transition-colors duration-200 ease-out " +
  "focus-visible:ring-2 focus-visible:ring-ring/25";

/* -- Expanded: the sub-item row ------------------------------------------ */

const rowBase =
  "relative w-full flex items-center rounded-full text-body-md " +
  "transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25";

const rowActive = "bg-secondary text-foreground font-medium";

const rowIdle =
  "text-ink-secondary hover:bg-secondary hover:text-foreground";

/**
 * One rail control.
 *
 * Renders an anchor when it navigates and a button when it does not, which is
 * what makes navigation feel instant: Next only prefetches real links, so a
 * `<button onClick={router.push}>` pays for the route's chunk and RSC payload
 * at click time. As a link the payload is already cached before the click, and
 * middle-click, ctrl-click and "open in new tab" start working too.
 *
 * Collapsed, the label is removed from the DOM rather than truncated — a
 * clipped "D…" reads as a rendering fault. The name is still reachable: the
 * control keeps an accessible name and shows a tooltip on hover.
 */
function NavButton({
  icon: Icon,
  label,
  href,
  active = false,
  collapsed,
  onClick,
  trailing,
  className,
}: {
  icon: React.ElementType;
  label: string;
  /** Destination. Omit for controls that act rather than navigate. */
  href?: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const classes = cn(controlBase, collapsed ? "justify-center" : "w-full gap-2.5 pr-2.5", className);

  const inner = (
    <>
      <span className={cn(discBase, active ? discActive : discIdle)}>
        <Icon className="block h-[17px] w-[17px] shrink-0" />
      </span>
      {!collapsed && (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left text-body-md",
            active ? "text-foreground font-medium" : "text-ink-secondary",
          )}
        >
          {label}
        </span>
      )}
      {!collapsed && trailing}
    </>
  );

  const button = href ? (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={classes}
    >
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} aria-label={collapsed ? label : undefined} className={classes}>
      {inner}
    </button>
  );

  // Expanded already shows the label, so a tooltip would only repeat it.
  if (!collapsed) return button;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme = "light", setTheme } = useTheme();
  const anvayaLogo = (theme === "dark" ? anvayaLogoDark : anvayaLogoLight).src;

  /*
    Collapsed is the default state of the product, and it is also the initial
    render on both server and client — so the first paint never flashes an
    expanded rail. A preference from earlier in the same tab is applied after
    mount, where sessionStorage is actually readable.
  */
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (sessionStorage.getItem(COLLAPSE_KEY) === "false") setCollapsed(false);
  }, []);

  const setCollapsedPersisted = (next: boolean) => {
    setCollapsed(next);
    try {
      sessionStorage.setItem(COLLAPSE_KEY, String(next));
    } catch {
      // Private-mode storage denial is not worth failing navigation over.
    }
  };

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navSections.forEach((s) => {
      const isActive = s.items.some((i) => i.path === pathname);
      initial[s.label] = isActive || s.label === "Material planning";
    });
    return initial;
  });

  /*
    Keep the group holding the current page unfolded. Collapsed, a section
    control now navigates without expanding the rail, so without this the user
    could be on a Production page and later open the rail to find Production
    shut.
  */
  useEffect(() => {
    const owner = navSections.find((sec) => sec.items.some((i) => i.path === pathname));
    if (owner) setOpenSections((prev) => (prev[owner.label] ? prev : { ...prev, [owner.label]: true }));
  }, [pathname]);

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  /*
    Identity for the account control. Read after mount — localStorage does not
    exist during server rendering, and reading it inline would desync the
    first client paint.
  */
  const [identity, setIdentity] = useState({ email: "guest@matrixops.in", role: "admin" });
  useEffect(() => {
    setIdentity({
      email: localStorage.getItem("matrixops_email") || "guest@matrixops.in",
      role: localStorage.getItem("matrixops_role") || "admin",
    });
  }, []);
  const { email, role } = identity;

  const handleLogout = () => {
    localStorage.removeItem("matrixops_auth");
    router.push("/login");
  };

  const isDark = theme === "dark";

  return (
    <aside
      className={cn(
        "h-screen flex flex-col flex-shrink-0 sticky top-0",
        "bg-sidebar",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[68px]" : "w-[268px]",
      )}
    >
      {/* Wordmark. Set to the height of the application bar on the other side
          of the seam so the two line up, and pinned to the same left gutter as
          the discs below it once the rail is open.

          The asset is a 1000x1000 square with generous internal margin, so the
          artwork occupies well under the box it is given and has to be set
          larger than a tight logo would to read at the same weight. */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center px-2 transition-[height] duration-300 ease-out",
          // Collapsed the row matches the application bar's height; expanded it
          // grows, which it can do freely because the rail draws no divider for
          // that bar's border to line up with.
          collapsed ? "h-14" : "h-20",
        )}
      >
        <img
          src={anvayaLogo}
          alt="Anvaya"
          className={cn(
            "block w-auto object-contain transition-[height] duration-300 ease-out",
            collapsed ? "h-10" : "h-16",
          )}
        />
      </div>

      {/* Collapse toggle. Sits at the top of the rail, where the reference puts
          it, so the control that changes the rail's width is the first thing
          under the mark rather than buried at the bottom. */}
      <div className={cn("flex py-2", collapsed ? "justify-center px-3" : "px-3")}>
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCollapsedPersisted(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={cn(controlBase, collapsed ? "justify-center" : "w-full gap-2.5 pr-2.5")}
            >
              <span className={cn(discBase, discIdle)}>
                <ChevronRight
                  className={cn(
                    "block h-[17px] w-[17px] shrink-0 transition-transform duration-300 ease-out",
                    !collapsed && "rotate-180",
                  )}
                />
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-left text-body-md text-ink-secondary">
                  Collapse
                </span>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" sideOffset={10}>
              Expand sidebar
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Nav. Collapsed spacing is deliberately looser than expanded: a column
          of bare glyphs needs the air to read as separate instruments. */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden py-2",
          collapsed ? "flex flex-col items-center gap-1 px-3" : "space-y-1 px-3",
        )}
      >
        {topNavItems.map((item) => (
          <NavButton
            key={item.path}
            icon={item.icon}
            label={item.label}
            href={item.path}
            active={pathname === item.path}
            collapsed={collapsed}
          />
        ))}
        {navSections.map((section) => {
          const isOpen = openSections[section.label];
          const hasActivePath = section.items.some((i) => i.path === pathname);
          const totalBadge = section.items.reduce((sum, i) => sum + (i.badge || 0), 0);
          /*
            The section's landing page: its first item that is actually a route.
            Settings leads with Company & Warehouses — the theme toggle and
            sign-out sit in the same list but carry no path, so they are skipped.
          */
          const sectionHome = section.items.find((i) => i.path)?.path;

          return (
            <div key={section.label} className={collapsed ? "flex justify-center" : undefined}>
              <NavButton
                icon={section.icon}
                label={section.label}
                active={collapsed && hasActivePath}
                collapsed={collapsed}
                className={undefined}
                href={sectionHome}
                onClick={() => {
                  /*
                    A section control opens a page on the first click — the
                    href does the navigating, so the route is prefetched and
                    the click is instant. Expanded, it also unfolds the group,
                    so the sibling pages appear without a second click.
                  */
                  if (!collapsed) toggleSection(section.label);
                }}
                trailing={
                  <>
                    {totalBadge > 0 && (
                      <span className="rounded-full bg-danger px-2 py-0.5 text-caption font-medium text-danger-foreground min-w-[20px] text-center">
                        {totalBadge}
                      </span>
                    )}
                    {isOpen
                      ? <ChevronDown className="block h-3.5 w-3.5 shrink-0 text-ink-quaternary" />
                      : <ChevronRight className="block h-3.5 w-3.5 shrink-0 text-ink-quaternary" />}
                  </>
                }
              />

              {!collapsed && isOpen && (
                <div className="ml-[18px] mt-1 space-y-0.5 pl-4 animate-fade-in">
                  {section.items.map((item) => {
                    const isActive = pathname === item.path;
                    const ItemIcon = item.icon;

                    if (item.label === "theme-toggle") {
                      return (
                        <button
                          key="theme-toggle"
                          onClick={() => setTheme(isDark ? "light" : "dark")}
                          className={cn(rowBase, rowIdle, "h-8 gap-2.5 px-3")}
                        >
                          {isDark
                            ? <Sun className="block h-3.5 w-3.5 shrink-0" />
                            : <Moon className="block h-3.5 w-3.5 shrink-0" />}
                          <span className="truncate flex-1 text-left">{isDark ? "Light mode" : "Dark mode"}</span>
                        </button>
                      );
                    }

                    if (item.label === "Logout") {
                      return (
                        <button
                          key="logout"
                          onClick={handleLogout}
                          className={cn(rowBase, rowIdle, "h-8 gap-2.5 px-3")}
                        >
                          <LogOut className="block h-3.5 w-3.5 shrink-0" />
                          <span className="truncate flex-1 text-left">Logout</span>
                        </button>
                      );
                    }

                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        prefetch
                        aria-current={isActive ? "page" : undefined}
                        className={cn(rowBase, "h-8 gap-2.5 px-3", isActive ? rowActive : rowIdle)}
                      >
                        <ItemIcon className="block h-3.5 w-3.5 shrink-0" />
                        <span className="truncate flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <span className="rounded-full bg-danger px-2 py-0.5 text-caption font-medium text-danger-foreground min-w-[20px] text-center">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Account. The profile sits at the foot of the rail and carries the
          things that belong to the person rather than the page — theme, admin
          and sign-out — so the top bar can stay purely locational. */}
      <div className={cn("py-3", collapsed ? "flex flex-col items-center px-3" : "px-3")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Account"
              className={cn(controlBase, collapsed ? "justify-center" : "w-full gap-2.5 pr-2.5")}
            >
              <span className={cn(discBase, "bg-primary text-primary-foreground")}>
                <User className="block h-[17px] w-[17px]" />
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 text-left leading-tight">
                  <span className="block truncate text-body-sm font-medium text-foreground">{email}</span>
                  <span className="block truncate text-body-sm capitalize text-ink-quaternary">{role}</span>
                </span>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-body-sm font-medium text-foreground">{email}</span>
              <span className="block truncate text-body-sm capitalize text-ink-quaternary">{role}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {isDark
                  ? <Moon className="mr-2 block h-4 w-4 shrink-0" />
                  : <Sun className="mr-2 block h-4 w-4 shrink-0" />}
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuItem asChild>
              <Link href="/users-roles" prefetch>
                <ShieldCheck className="mr-2 block h-4 w-4 shrink-0" />
                Admin &amp; Controls
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/company-settings" prefetch>
                <Building className="mr-2 block h-4 w-4 shrink-0" />
                Company &amp; warehouses
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="mr-2 block h-4 w-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
