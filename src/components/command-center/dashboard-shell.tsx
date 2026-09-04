"use client";

import { useState } from "react";
import { Menu, PanelRight, X } from "lucide-react";
import { ActionQueue } from "./action-queue";
import { CommandHeader } from "./command-header";
import { CommandRail } from "./command-rail";
import { ExceptionPanel } from "./exception-panel";
import { HealthScoreCard } from "./health-score-card";
import { PlantStage } from "./plant-stage";
import { RecentActivity } from "./recent-activity";
import { IconButton } from "./ui/icon-button";
import { activeException, type ActionItem } from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

/**
 * Three-column command center.
 *
 * xl and up  : rail | main | persistent details panel
 * md .. xl   : rail | main, details panel as a right-hand overlay drawer
 * below md   : rail becomes an overlay drawer, content stacks, panel is full-screen
 */
export function DashboardShell() {
  const [selectedId, setSelectedId] = useState<string>(activeException.id);
  const [panelOpen, setPanelOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const handleSelect = (item: ActionItem) => {
    setSelectedId(item.id);
    setPanelOpen(true);
  };

  return (
    <div className="cc-root flex h-dvh w-full overflow-hidden font-sans">
      {/* Rail — inline from md up, drawer below it. */}
      <div className="hidden md:block">
        <CommandRail />
      </div>

      {railOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setRailOpen(false)}
            aria-hidden="true"
          />
          <div className="relative">
            <CommandRail />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-start justify-between gap-3 px-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <IconButton
              label="Open navigation"
              size="sm"
              variant="surface"
              className="mt-1 md:hidden"
              onClick={() => setRailOpen(true)}
            >
              <Menu className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
            <CommandHeader title="Dashboard" breadcrumb="Dashboard" />
          </div>

          <IconButton
            label="Open exception details"
            size="sm"
            variant="surface"
            className="mt-1 xl:hidden"
            onClick={() => setPanelOpen(true)}
          >
            <PanelRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>

        <main className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <PlantStage className="h-[300px] shrink-0 lg:h-[368px]">
            <HealthScoreCard className="absolute left-4 top-4 hidden sm:block" />
          </PlantStage>

          {/* Below sm the card cannot float without covering the map. */}
          <HealthScoreCard className="w-full sm:hidden" />

          <ActionQueue selectedId={selectedId} onSelect={handleSelect} />
          <RecentActivity />
        </main>
      </div>

      {/* Details panel — persistent at xl, overlay below. */}
      <div className="hidden w-[320px] shrink-0 xl:block">
        <ExceptionPanel />
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              "cc-root relative h-full w-full bg-surface-secondary shadow-cc-panel",
              "sm:w-[340px]",
            )}
          >
            <ExceptionPanel onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
