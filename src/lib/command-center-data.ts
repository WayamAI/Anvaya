/**
 * Placeholder data for the plant command center.
 *
 * Shapes here mirror what an MRP/MES feed would eventually provide, so swapping
 * these constants for a query later should not require touching the components.
 */

export type Severity = "critical" | "warning" | "info";
export type QueueState = "open" | "in-progress" | "resolved";

export interface ActionItem {
  id: string;
  severity: Severity;
  asset: string;
  assetLine: string;
  description: string;
  time: string;
  timestamp: string;
  operator: string;
  operatorInitials: string;
  state: QueueState;
}

export interface AssetHealth {
  healthy: number;
  warning: number;
  critical: number;
}

export interface TelemetryReading {
  label: string;
  value: string;
  unit: string;
  severity: Severity | "nominal";
  delta?: string;
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
    asset: "EXT-002",
    assetLine: "Line 4 · Extruder",
    description: "Barrel temperature above tolerance — coolant pressure dropping",
    time: "2 min ago",
    timestamp: "14:32",
    operator: "M. Raut",
    operatorInitials: "MR",
    state: "in-progress",
  },
  {
    id: "EXC-0002",
    severity: "warning",
    asset: "CNC-014",
    assetLine: "Line 2 · Machining",
    description: "Spindle load trending high across last 40 cycles",
    time: "18 min ago",
    timestamp: "14:16",
    operator: "S. Kulkarni",
    operatorInitials: "SK",
    state: "open",
  },
  {
    id: "EXC-0003",
    severity: "warning",
    asset: "RM-4471",
    assetLine: "Stores · Raw material",
    description: "Polymer granulate below safety stock — 3 day cover remaining",
    time: "41 min ago",
    timestamp: "13:53",
    operator: "A. Fernandes",
    operatorInitials: "AF",
    state: "open",
  },
  {
    id: "EXC-0004",
    severity: "info",
    asset: "WO-8821",
    assetLine: "Line 1 · Assembly",
    description: "Work order released ahead of schedule — capacity reallocated",
    time: "1 hr ago",
    timestamp: "13:30",
    operator: "P. Nair",
    operatorInitials: "PN",
    state: "open",
  },
  {
    id: "EXC-0005",
    severity: "warning",
    asset: "PKG-006",
    assetLine: "Line 5 · Packaging",
    description: "Changeover overrun 12 min against standard",
    time: "1 hr ago",
    timestamp: "13:22",
    operator: "R. Deshmukh",
    operatorInitials: "RD",
    state: "open",
  },
  {
    id: "EXC-0006",
    severity: "info",
    asset: "PO-2214",
    assetLine: "Procurement",
    description: "Vendor confirmed revised dispatch date for bearing housings",
    time: "2 hr ago",
    timestamp: "12:48",
    operator: "K. Iyer",
    operatorInitials: "KI",
    state: "open",
  },
  {
    id: "EXC-0007",
    severity: "warning",
    asset: "OVN-003",
    assetLine: "Line 3 · Curing",
    description: "Chamber humidity outside band for 6 consecutive readings",
    time: "2 hr ago",
    timestamp: "12:31",
    operator: "S. Kulkarni",
    operatorInitials: "SK",
    state: "open",
  },
  {
    id: "EXC-0008",
    severity: "info",
    asset: "BATCH-77A",
    assetLine: "Quality",
    description: "Batch released to finished goods after QC sign-off",
    time: "3 hr ago",
    timestamp: "11:57",
    operator: "N. Bhosale",
    operatorInitials: "NB",
    state: "resolved",
  },
];

/** Counts shown on the queue filter pills. */
export const queueFilters = [
  { id: "all", label: "All", count: 54 },
  { id: "critical", label: "Critical", count: 1 },
  { id: "warning", label: "Warning", count: 25 },
  { id: "info", label: "Info", count: 23 },
  { id: "open", label: "Open", count: 48 },
  { id: "in-progress", label: "In Progress", count: 1 },
  { id: "today", label: "Today", count: 49 },
] as const;

export type QueueFilterId = (typeof queueFilters)[number]["id"];

/** The exception currently selected in the right-hand panel. */
export const activeException = {
  id: "EXC-0001",
  title: "Exception",
  severity: "critical" as Severity,
  headline: "Critical telemetry from EXT-002",
  location: "Plant 2 · Line 4, Station 45",
  detectedAt: "14:32",
  asset: "EXT-002",
  assetType: "Twin-screw extruder",
  operator: {
    name: "Mahesh Raut",
    initials: "MR",
    role: "Shift lead · B shift",
  },
  telemetry: [
    { label: "Temperature", value: "248", unit: "°C", severity: "critical", delta: "+31" },
    { label: "Voltage", value: "402", unit: "V", severity: "warning", delta: "-18" },
    { label: "Coolant Level", value: "26", unit: "%", severity: "critical", delta: "-44" },
    { label: "Line Speed", value: "18.4", unit: "m/min", severity: "nominal", delta: "0.0" },
  ] satisfies TelemetryReading[],
};
