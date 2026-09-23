/**
 * Placeholder data for the fleet dashboard.
 *
 * Shapes mirror what a telemetry feed would return, so swapping these
 * constants for a query later should not require touching the components.
 */

import type { HealthSegment } from "@/components/dashboard/health-score-card";
import type { MapMarker } from "@/components/dashboard/map-stage";
import type { ActionItem, Incident, QueueFilter } from "@/components/dashboard/types";

export const fleetHealthScore = 99;

/** Change in health score over the selected period, in percentage points. */
export const fleetHealthDelta = 1.2;

export const fleetHealthSegments: HealthSegment[] = [
  { tone: "healthy", label: "Healthy", value: 296 },
  { tone: "warning", label: "Warning", value: 3 },
  { tone: "critical", label: "Critical", value: 1 },
];

export const fleetMapMarkers: MapMarker[] = [
  { id: "v1", x: "31%", y: "58%", tone: "healthy" },
  { id: "v2", x: "44%", y: "39%", tone: "healthy" },
  { id: "v3", x: "58%", y: "63%", tone: "warning" },
  { id: "v4", x: "66%", y: "31%", tone: "healthy" },
  { id: "v5", x: "72%", y: "54%", tone: "critical" },
  { id: "v6", x: "83%", y: "44%", tone: "healthy" },
  { id: "v7", x: "24%", y: "36%", tone: "healthy" },
];

export const fleetQueueFilters: QueueFilter[] = [
  { id: "all", label: "All", count: 54 },
  { id: "critical", label: "Critical", count: 1 },
  { id: "warning", label: "Warning", count: 25 },
  { id: "info", label: "Info", count: 23 },
  { id: "open", label: "Open", count: 48 },
  { id: "in-progress", label: "In progress", count: 1 },
  { id: "today", label: "Today", count: 49 },
];

export const fleetActionQueue: ActionItem[] = [
  {
    id: "SIM-0001",
    severity: "critical",
    subject: "SIM-0001",
    subjectDetail: "M7 Highway - KM 45",
    description: "Coolant temperature above tolerance - engine derate imminent",
    timestamp: "14:32",
    time: "2 min ago",
    assignee: "Mike Ross",
    assigneeInitials: "MR",
    state: "in-progress",
  },
  {
    id: "SIM-0114",
    severity: "warning",
    subject: "SIM-0114",
    subjectDetail: "Depot 2 - Long haul",
    description: "Brake pad wear at 18% - service window closing",
    timestamp: "14:16",
    time: "18 min ago",
    assignee: "S. Kulkarni",
    assigneeInitials: "SK",
    state: "open",
  },
  {
    id: "SIM-0087",
    severity: "warning",
    subject: "SIM-0087",
    subjectDetail: "Route A9 - Regional",
    description: "Fuel consumption 12% above baseline for this route",
    timestamp: "13:53",
    time: "41 min ago",
    assignee: "A. Fernandes",
    assigneeInitials: "AF",
    state: "open",
  },
  {
    id: "SIM-0042",
    severity: "info",
    subject: "SIM-0042",
    subjectDetail: "Depot 1 - Urban",
    description: "Scheduled service completed - returned to active duty",
    timestamp: "13:30",
    time: "1 hr ago",
    assignee: "P. Nair",
    assigneeInitials: "PN",
    state: "open",
  },
  {
    id: "SIM-0203",
    severity: "warning",
    subject: "SIM-0203",
    subjectDetail: "M7 Highway - KM 12",
    description: "Harsh braking events elevated across last 40 km",
    timestamp: "13:22",
    time: "1 hr ago",
    assignee: "R. Deshmukh",
    assigneeInitials: "RD",
    state: "open",
  },
  {
    id: "SIM-0156",
    severity: "info",
    subject: "SIM-0156",
    subjectDetail: "Depot 3 - Distribution",
    description: "Tyre pressure normalised after depot check",
    timestamp: "12:48",
    time: "2 hr ago",
    assignee: "K. Iyer",
    assigneeInitials: "KI",
    state: "open",
  },
  {
    id: "SIM-0068",
    severity: "warning",
    subject: "SIM-0068",
    subjectDetail: "Route B2 - Regional",
    description: "Battery voltage dipping under load on cold start",
    timestamp: "12:31",
    time: "2 hr ago",
    assignee: "S. Kulkarni",
    assigneeInitials: "SK",
    state: "open",
  },
  {
    id: "SIM-0011",
    severity: "info",
    subject: "SIM-0011",
    subjectDetail: "Depot 1 - Urban",
    description: "Telematics unit firmware updated successfully",
    timestamp: "11:57",
    time: "3 hr ago",
    assignee: "N. Bhosale",
    assigneeInitials: "NB",
    state: "resolved",
  },
];

export const activeIncident: Incident = {
  id: "SIM-0001",
  title: "Incident",
  severity: "critical",
  headline: "Critical telemetry from SIM-0001",
  location: "M7 Highway, KM 45",
  detectedAt: "14:32",
  subject: "SIM-0001",
  subjectType: "Long-haul tractor unit",
  person: {
    name: "Mike Ross",
    initials: "MR",
    role: "Driver - Route M7",
  },
  telemetry: [
    { label: "Temperature", value: "112", unit: "°C", severity: "critical", delta: "+27" },
    { label: "Voltage", value: "11.4", unit: "V", severity: "warning", delta: "-1.6" },
    { label: "Coolant level", value: "18", unit: "%", severity: "critical", delta: "-52" },
    { label: "Speed", value: "84", unit: "km/h", severity: "nominal", delta: "0" },
  ],
};
