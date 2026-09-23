"use client";

import { useState } from "react";
import { BrandMark } from "./brand-mark";
import type { IconName } from "@/lib/icons";
import { SidebarItem } from "./sidebar-item";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "dashboard", icon: "dashboard", label: "Dashboard" },
  { id: "vehicles", icon: "vehicle", label: "Vehicles" },
  { id: "alerts", icon: "warning", label: "Alerts" },
  { id: "calendar", icon: "calendar", label: "Calendar" },
  { id: "maintenance", icon: "maintenance", label: "Maintenance" },
  { id: "documents", icon: "document", label: "Documents" },
] satisfies { id: string; icon: IconName; label: string }[];

export function Sidebar({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState("dashboard");

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full w-[68px] shrink-0 flex-col items-center",
        "border-r border-muted bg-container",
        "px-[15px] py-4",
        className,
      )}
    >
      <BrandMark />

      <ul className="mt-6 flex flex-col items-center gap-2.5">
        {navItems.map((item) => (
          <li key={item.id}>
            <SidebarItem
              icon={item.icon}
              label={item.label}
              active={activeId === item.id}
              onClick={() => setActiveId(item.id)}
            />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-2.5">
        {/* Utility control. Left unwired for now — this pass is structural. */}
        <SidebarItem icon="theme" label="Toggle theme" />
        <SidebarItem
          icon="settings"
          label="Settings"
          active={activeId === "settings"}
          onClick={() => setActiveId("settings")}
        />
      </div>
    </nav>
  );
}
