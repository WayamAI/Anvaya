"use client";

import { useState } from "react";
import {
  Activity,
  Boxes,
  CircleUser,
  Factory,
  LayoutGrid,
  LifeBuoy,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
}

/** One control in the icon rail. Active state is a bright plate, as on hardware. */
export function SidebarItem({ icon: Icon, label, active = false, badge, onClick }: SidebarItemProps) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={label}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-[12px]",
          "transition-all duration-200 ease-cc active:scale-[0.97]",
          active
            ? "bg-action-primary text-on-light shadow-cc-sm"
            : "text-muted hover:bg-surface-tertiary hover:text-primary",
        )}
      >
        <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
        {badge ? (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center",
              "rounded-full bg-feedback-critical px-1 text-caption font-semibold leading-none text-on-color",
              "ring-2 ring-page",
            )}
          >
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

const primaryNav = [
  { id: "overview", icon: LayoutGrid, label: "Overview" },
  { id: "lines", icon: Factory, label: "Production lines" },
  { id: "telemetry", icon: Activity, label: "Live telemetry" },
  { id: "exceptions", icon: TriangleAlert, label: "Exceptions", badge: 1 },
  { id: "inventory", icon: Boxes, label: "Inventory" },
];

const utilityNav = [
  { id: "controls", icon: SlidersHorizontal, label: "Planning controls" },
  { id: "settings", icon: Settings, label: "Settings" },
  { id: "support", icon: LifeBuoy, label: "Support" },
];

export function CommandRail({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState("overview");

  return (
    <nav
      aria-label="Command center"
      className={cn(
        "flex h-full w-[68px] shrink-0 flex-col items-center",
        "border-r border-subtle bg-page-subtle py-4",
        className,
      )}
    >
      <div
        className="mb-5 flex h-8 w-8 items-center justify-center rounded-[10px] border border-default bg-surface-tertiary"
        aria-hidden="true"
      >
        <span className="text-body-md font-semibold leading-none text-primary">A</span>
      </div>

      <ul className="flex flex-col items-center gap-1.5">
        {primaryNav.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            badge={item.badge}
            active={activeId === item.id}
            onClick={() => setActiveId(item.id)}
          />
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ul className="flex flex-col items-center gap-1.5">
          {utilityNav.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeId === item.id}
              onClick={() => setActiveId(item.id)}
            />
          ))}
        </ul>
        <div className="my-1 h-px w-6 bg-stroke-subtle" aria-hidden="true" />
        <button
          type="button"
          aria-label="Account"
          title="Account"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-subtle bg-surface-tertiary text-secondary transition-colors duration-200 ease-cc hover:border-default hover:text-primary"
        >
          <CircleUser className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  );
}
