"use client";

import { useState } from "react";
import { CommandRail } from "./command-rail";
import { IncidentPanel } from "@/components/dashboard/incident-panel";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";
import { MapStage } from "@/components/dashboard/map-stage";
import { IconButton } from "@/components/ui/icon-button";
import { RecentActivity } from "./recent-activity";
import {
  actionQueue,
  activeException,
  assetHealth,
  healthScore,
  plantMapMarkers,
  queueFilters,
  type ActionItem,
} from "@/lib/command-center-data";
import { cn } from "@/lib/utils";

/**
 * Three-column command center.
 *
 * xl and up  : rail | main | persistent details panel
 * md .. xl   : rail | main, details panel as a right-hand overlay drawer
 * below md   : rail becomes an overlay drawer, content stacks, panel is full-screen
 */
const healthCardProps = {
  score: healthScore,
  delta: 1.2,
  segments: [
    { tone: "healthy" as const, label: "Healthy", value: assetHealth.healthy },
    { tone: "warning" as const, label: "Warning", value: assetHealth.warning },
    { tone: "critical" as const, label: "Critical", value: assetHealth.critical },
  ],
};

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
              icon="controls"
              label="Open navigation"
              size="sm"
              variant="subtle"
              className="mt-1 md:hidden"
              onClick={() => setRailOpen(true)}
            />
            <DashboardHeader title="Dashboard" breadcrumb="Dashboard" />
          </div>

          <IconButton
            icon="layers"
            label="Open exception details"
            size="sm"
            variant="subtle"
            className="mt-1 xl:hidden"
            onClick={() => setPanelOpen(true)}
          />
        </div>

        <main className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <MapStage
            markers={plantMapMarkers}
            label="Plant map"
            className="h-[300px] shrink-0 lg:h-[368px]"
          >
            <HealthScoreCard {...healthCardProps} className="absolute left-4 top-4 hidden sm:block" />
          </MapStage>

          {/* Below sm the card cannot float without covering the map. */}
          <HealthScoreCard {...healthCardProps} className="w-full sm:hidden" />

          <ActionQueue
            items={actionQueue}
            filters={queueFilters}
            selectedId={selectedId}
            onSelect={handleSelect}
            subjectLabel="Asset"
            assigneeLabel="Operator"
          />
          <RecentActivity />
        </main>
      </div>

      {/* Details panel — persistent at xl, overlay below. */}
      <div className="hidden w-[320px] shrink-0 xl:block">
        <IncidentPanel
            incident={activeException}
            personLabel="Operator"
            assistLabel="AI Planner is active"
            detectedLabel="Exception detected"
            primaryAction="Confirm line stop"
            secondaryActions={["View asset", "Raise work order"]}
          />
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
            <IncidentPanel
              incident={activeException}
              personLabel="Operator"
              assistLabel="AI Planner is active"
              detectedLabel="Exception detected"
              primaryAction="Confirm line stop"
              secondaryActions={["View asset", "Raise work order"]}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
