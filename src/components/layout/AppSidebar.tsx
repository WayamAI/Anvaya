"use client";

import { useEffect, useState } from "react";
import anvayaLogoLight from "@/assets/anvaya-logo-light.svg";
import anvayaLogoDark from "@/assets/anvaya-logo-dark.svg";
// The mark carries no wordmark, so it needs no light and dark variant: the
// gradient reads against either background.
import anvayaMarkAsset from "@/assets/anvaya-mark.svg";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/components/auth/session-context";
import { canSeeNavItem, visibleSections } from "./nav-access";
import { navSections, topNavItems } from "./nav-items";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Layers, Factory, Package, ShoppingCart, TrendingUp, BarChart3, Settings, Zap, ClipboardList, Shield, Box, Truck, FileText, AlertTriangle, Calendar, Wrench, MapPin, Hash, Heart, LineChart, Target, PieChart, FileBarChart, Users, Link2, Bell, Search } from "lucide-react";
import { ChevronDownIcon, ChevronRightIcon, CompanyWarehouseIcon, LogoutIcon, ThemeDarkIcon, ThemeLightIcon, UserAccountIcon, UsersRolesIcon } from "@/components/icons/chronos";

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
  const anvayaMark = anvayaMarkAsset.src;

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
    Identity comes from the session the route guard resolved, so the rail
    shows who is actually signed in rather than whatever a local flag last
    claimed. Roles are joined because a user may hold more than one.
  */
  const { user, can } = useSession();
  // Only the screens this user's permissions would load (see nav-access).
  const topItems = topNavItems.filter((i) => canSeeNavItem(i.path, can));
  const sections = visibleSections(navSections, can);
  const email = user.email;
  const role = user.roles.length ? user.roles.join(", ").toLowerCase() : "no role";

  /*
    Sign-out revokes the session server-side before navigating. Clearing a
    cookie alone would leave the session valid for anyone holding a copy of
    it, so the request matters even though the redirect looks the same.
  */
  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Even if the call fails, send the user to the login screen; the
      // session expires on its own and the next request will be rejected.
    }
    router.replace("/login");
    router.refresh();
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
      {/* Brand. Set to the height of the application bar on the other side of
          the seam so the two line up.

          Two assets rather than one scaled asset. The full lockup is 4.5:1;
          squeezed into the 68px rail its letterforms would come out about
          four pixels tall, which is a smudge rather than a wordmark. So the
          rail shows the mark alone when collapsed and the lockup once there
          is width to read it. Both are cropped to their own artwork, so the
          height class below sets the artwork height exactly. */}
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
          src={collapsed ? anvayaMark : anvayaLogo}
          alt="Anvaya"
          className={cn(
            "block w-auto object-contain",
            // 32px tall gives the mark the same presence as the 36px discs
            // below it; 44px of lockup puts the wordmark at ~17px, which
            // reads comfortably and still leaves the rail generous margins.
            collapsed ? "h-8" : "h-11",
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
                <ChevronRightIcon
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
        {topItems.map((item) => (
          <NavButton
            key={item.path}
            icon={item.icon}
            label={item.label}
            href={item.path}
            active={pathname === item.path}
            collapsed={collapsed}
          />
        ))}
        {sections.map((section) => {
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
                      ? <ChevronDownIcon className="block h-3.5 w-3.5 shrink-0 text-ink-quaternary" />
                      : <ChevronRightIcon className="block h-3.5 w-3.5 shrink-0 text-ink-quaternary" />}
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
                            ? <ThemeLightIcon className="block h-3.5 w-3.5 shrink-0" />
                            : <ThemeDarkIcon className="block h-3.5 w-3.5 shrink-0" />}
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
                          <LogoutIcon className="block h-3.5 w-3.5 shrink-0" />
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
                <UserAccountIcon className="block h-[17px] w-[17px]" />
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
                  ? <ThemeDarkIcon className="mr-2 block h-4 w-4 shrink-0" />
                  : <ThemeLightIcon className="mr-2 block h-4 w-4 shrink-0" />}
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
                <UsersRolesIcon className="mr-2 block h-4 w-4 shrink-0" />
                Admin &amp; Controls
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/company-settings" prefetch>
                <CompanyWarehouseIcon className="mr-2 block h-4 w-4 shrink-0" />
                Company &amp; warehouses
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={handleLogout}>
              <LogoutIcon className="mr-2 block h-4 w-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
