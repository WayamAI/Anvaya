"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";
import { MapStage } from "@/components/dashboard/map-stage";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { IncidentPanel } from "@/components/dashboard/incident-panel";
import type { ActionItem } from "@/components/dashboard/types";
import {
  activeIncident,
  fleetActionQueue,
  fleetHealthDelta,
  fleetHealthScore,
  fleetHealthSegments,
  fleetMapMarkers,
  fleetQueueFilters,
} from "@/lib/fleet-data";

export default function FleetPage() {
  const [selectedId, setSelectedId] = useState<string>(fleetActionQueue[0].id);

  const healthCard = {
    score: fleetHealthScore,
    delta: fleetHealthDelta,
    segments: fleetHealthSegments,
    entityLabel: "vehicles",
  };

  return (
    <AppShell
      panelLabel="Open incident details"
      panel={({ onClose }) => (
        <IncidentPanel
          incident={activeIncident}
          personLabel="Driver"
          assistLabel="AI Concierge is active"
          primaryAction="Confirm evacuation"
          secondaryActions={["View profile", "Insurance claim"]}
          onClose={onClose}
        />
      )}
    >
      <div className="flex flex-col gap-3 px-6 pb-6 pt-5">
        <DashboardHeader title="Dashboard" breadcrumb="Dashboard" />

        <MapStage
          markers={fleetMapMarkers}
          label="Fleet map"
          className="mt-2 h-[300px] shrink-0 lg:h-[368px]"
        >
          <HealthScoreCard {...healthCard} className="absolute left-4 top-4 hidden sm:block" />
        </MapStage>

        {/* Below sm the card cannot float without covering the map. */}
        <HealthScoreCard {...healthCard} className="w-full sm:hidden" />

        <ActionQueue
          items={fleetActionQueue}
          filters={fleetQueueFilters}
          selectedId={selectedId}
          onSelect={(item: ActionItem) => setSelectedId(item.id)}
          subjectLabel="Vehicle"
          assigneeLabel="Driver"
        />
      </div>
    </AppShell>
  );
}
