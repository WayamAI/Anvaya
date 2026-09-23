/**
 * Placeholder data for the plant command center.
 *
 * Shapes here mirror what an MRP/MES feed would eventually provide, so swapping
 * these constants for a query later should not require touching the components.
 */

import type { MapMarker } from "@/components/dashboard/map-stage";
import type { ActionItem, Incident, QueueFilter, Severity, TelemetryReading } from "@/components/dashboard/types";

export type { ActionItem, Severity, TelemetryReading };




export interface AssetHealth {
  healthy: number;
  warning: number;
  critical: number;
}



export const assetHealth: AssetHealth = {
  healthy: 296,
  warning: 3,
  critical: 1,
};

export const healthScore = 99;

export const actionQueue: ActionItem[] = [
  {
    id: "EXC-0001",
    severity: "critical",
    subject: "EXT-002",
    subjectDetail: "Line 4 · Extruder",
    description: "Barrel temperature above tolerance — coolant pressure dropping",
    time: "2 min ago",
    timestamp: "14:32",
    assignee: "M. Raut",
    assigneeInitials: "MR",
    state: "in-progress",
  },
  {
    id: "EXC-0002",
    severity: "warning",
    subject: "CNC-014",
    subjectDetail: "Line 2 · Machining",
    description: "Spindle load trending high across last 40 cycles",
    time: "18 min ago",
    timestamp: "14:16",
    assignee: "S. Kulkarni",
    assigneeInitials: "SK",
    state: "open",
  },
  {
    id: "EXC-0003",
    severity: "warning",
    subject: "RM-4471",
    subjectDetail: "Stores · Raw material",
    description: "Polymer granulate below safety stock — 3 day cover remaining",
    time: "41 min ago",
    timestamp: "13:53",
    assignee: "A. Fernandes",
    assigneeInitials: "AF",
    state: "open",
  },
  {
    id: "EXC-0004",
    severity: "info",
    subject: "WO-8821",
    subjectDetail: "Line 1 · Assembly",
    description: "Work order released ahead of schedule — capacity reallocated",
    time: "1 hr ago",
    timestamp: "13:30",
    assignee: "P. Nair",
    assigneeInitials: "PN",
    state: "open",
  },
  {
    id: "EXC-0005",
    severity: "warning",
    subject: "PKG-006",
    subjectDetail: "Line 5 · Packaging",
    description: "Changeover overrun 12 min against standard",
    time: "1 hr ago",
    timestamp: "13:22",
    assignee: "R. Deshmukh",
    assigneeInitials: "RD",
    state: "open",
  },
  {
    id: "EXC-0006",
    severity: "info",
    subject: "PO-2214",
    subjectDetail: "Procurement",
    description: "Vendor confirmed revised dispatch date for bearing housings",
    time: "2 hr ago",
    timestamp: "12:48",
    assignee: "K. Iyer",
    assigneeInitials: "KI",
    state: "open",
  },
  {
    id: "EXC-0007",
    severity: "warning",
    subject: "OVN-003",
    subjectDetail: "Line 3 · Curing",
    description: "Chamber humidity outside band for 6 consecutive readings",
    time: "2 hr ago",
    timestamp: "12:31",
    assignee: "S. Kulkarni",
    assigneeInitials: "SK",
    state: "open",
  },
  {
    id: "EXC-0008",
    severity: "info",
    subject: "BATCH-77A",
    subjectDetail: "Quality",
    description: "Batch released to finished goods after QC sign-off",
    time: "3 hr ago",
    timestamp: "11:57",
    assignee: "N. Bhosale",
    assigneeInitials: "NB",
    state: "resolved",
  },
];

/** Counts shown on the queue filter pills. */
export const queueFilters: QueueFilter[] = [
  { id: "all", label: "All", count: 54 },
  { id: "critical", label: "Critical", count: 1 },
  { id: "warning", label: "Warning", count: 25 },
  { id: "info", label: "Info", count: 23 },
  { id: "open", label: "Open", count: 48 },
  { id: "in-progress", label: "In progress", count: 1 },
  { id: "today", label: "Today", count: 49 },
];

/** The exception currently selected in the right-hand panel. */
export const activeException: Incident = {
  id: "EXC-0001",
  title: "Exception",
  severity: "critical",
  headline: "Critical telemetry from EXT-002",
  location: "Plant 2 · Line 4, Station 45",
  detectedAt: "14:32",
  subject: "EXT-002",
  subjectType: "Twin-screw extruder",
  person: {
    name: "Mahesh Raut",
    initials: "MR",
    role: "Shift lead · B shift",
  },
  telemetry: [
    { label: "Temperature", value: "248", unit: "°C", severity: "critical", delta: "+31" },
    { label: "Voltage", value: "402", unit: "V", severity: "warning", delta: "-18" },
    { label: "Coolant level", value: "26", unit: "%", severity: "critical", delta: "-44" },
    { label: "Line speed", value: "18.4", unit: "m/min", severity: "nominal", delta: "0.0" },
  ],
};

/** Placeholder plant positions for the map stage. Not geographic. */
export const plantMapMarkers: MapMarker[] = [
  { id: "p1", x: "31%", y: "58%", tone: "healthy" },
  { id: "p2", x: "44%", y: "39%", tone: "healthy" },
  { id: "p3", x: "58%", y: "63%", tone: "warning" },
  { id: "p4", x: "66%", y: "31%", tone: "healthy" },
  { id: "p5", x: "72%", y: "54%", tone: "critical" },
  { id: "p6", x: "83%", y: "44%", tone: "healthy" },
  { id: "p7", x: "24%", y: "36%", tone: "healthy" },
];
