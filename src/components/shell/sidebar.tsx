"use client";

import { useState } from "react";
import {
  CalendarDays,
  Car,
  FileText,
  LayoutDashboard,
  Moon,
  Settings,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { SidebarItem } from "./sidebar-item";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "vehicles", icon: Car, label: "Vehicles" },
  { id: "alerts", icon: TriangleAlert, label: "Alerts" },
  { id: "calendar", icon: CalendarDays, label: "Calendar" },
  { id: "maintenance", icon: Wrench, label: "Maintenance" },
  { id: "documents", icon: FileText, label: "Documents" },
];

export function Sidebar({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState("dashboard");

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full w-[68px] shrink-0 flex-col items-center",
        "border-r border-subtle bg-page-subtle",
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
        <SidebarItem icon={Moon} label="Toggle theme" />
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeId === "settings"}
          onClick={() => setActiveId("settings")}
        />
      </div>
    </nav>
  );
}
