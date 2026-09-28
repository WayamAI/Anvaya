import { startOfUtcDay } from "@/server/inventory/lots";

/**
 * Work orders — the rules, free of the database.
 *
 * Statuses are the schema's own. "Overdue" is not a status: it is derived,
 * for an order that is still open and past its planned end date.
 */

export const WORK_ORDER_STATUSES = [
  "PLANNED", "FIRMED", "RELEASED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** Orders that have not finished and have not been abandoned. */
export function isOpen(status: WorkOrderStatus): boolean {
  return status !== "COMPLETED" && status !== "CLOSED" && status !== "CANCELLED";
}

/** Production has begun, so what it consumed can be traced. */
export function hasStarted(status: WorkOrderStatus): boolean {
  return status === "IN_PROGRESS" || status === "COMPLETED" || status === "CLOSED";
}

/** Still open, and its planned end date is before today. */
export function isOverdue(status: WorkOrderStatus, plannedEndDate: Date, asOf: Date): boolean {
  return isOpen(status) && startOfUtcDay(plannedEndDate).getTime() < startOfUtcDay(asOf).getTime();
}

/**
 * Share of the order's components with a lot recorded against them — the
 * same backward-trace idea as Batch tracking. Null before production starts
 * (nothing to trace yet) and for an order with no components.
 */
export function traceCompleteness(status: WorkOrderStatus, components: { lotId: string | null }[]): number | null {
  if (!hasStarted(status) || components.length === 0) return null;
  return Math.round((components.filter((c) => c.lotId !== null).length / components.length) * 100);
}

export type StatusCounts = Record<"all" | "overdue" | WorkOrderStatus, number>;

export function statusCounts(orders: { status: WorkOrderStatus; overdue: boolean }[]): StatusCounts {
  const counts = Object.fromEntries(WORK_ORDER_STATUSES.map((s) => [s, 0])) as StatusCounts;
  counts.all = orders.length;
  counts.overdue = 0;
  for (const o of orders) {
    counts[o.status] += 1;
    if (o.overdue) counts.overdue += 1;
  }
  return counts;
}

/** Work centres in operation order, each listed once. */
export function workCentreRoute(operations: { sequence: number; workCentre: string | null }[]): string[] {
  const route: string[] = [];
  for (const op of [...operations].sort((a, b) => a.sequence - b.sequence)) {
    if (op.workCentre && !route.includes(op.workCentre)) route.push(op.workCentre);
  }
  return route;
}

/* ---- Material readiness ------------------------------------------------------ */

export type Readiness = "issued" | "available" | "short";

export interface ComponentReadiness {
  /** Still to issue: required − issued, never below zero. */
  outstanding: number;
  /** On hand at the order's location, as Stock Overview reports it. */
  onHand: number;
  shortfall: number;
  status: Readiness;
}

/** Quantities are Decimal(18, 6); float subtraction must not add noise beyond that. */
const qty6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Whether the stock at the order's location covers what is still to be
 * issued. Each order is judged on its own: stock is not allocated between
 * open orders, so two orders can both look ready against the same stock.
 */
export function componentReadiness(requiredQty: number, issuedQty: number, onHand: number): ComponentReadiness {
  const outstanding = qty6(Math.max(0, requiredQty - issuedQty));
  if (outstanding <= 0) return { outstanding: 0, onHand, shortfall: 0, status: "issued" };
  const shortfall = qty6(Math.max(0, outstanding - Math.max(0, onHand)));
  return { outstanding, onHand, shortfall, status: shortfall > 0 ? "short" : "available" };
}

/* ---- Response shapes (shared with the client as types only) ------------------- */

export interface WorkOrderRow {
  id: string;
  orderNumber: string;
  product: { id: string; code: string; name: string };
  uom: string;
  location: { id: string; name: string };
  plannedQty: number;
  producedQty: number;
  scrappedQty: number;
  bom: { code: string; version: string } | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  status: WorkOrderStatus;
  overdue: boolean;
  priority: number;
  workCentres: string[];
  componentCount: number;
  componentsWithLot: number;
  traceComplete: number | null;
}

export interface WorkOrderList {
  asOf: string;
  orders: WorkOrderRow[];
  counts: StatusCounts;
}

export interface WorkOrderDetail extends WorkOrderRow {
  notes: string | null;
  operations: {
    sequence: number;
    name: string;
    workCentre: string | null;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
    setupMinutes: number;
    runMinutes: number;
  }[];
  components: {
    material: { id: string; code: string; name: string; kind: string };
    uom: string;
    requiredQty: number;
    issuedQty: number;
    requiredDate: string;
    lot: { id: string; lotNumber: string; qcStatus: string } | null;
    /** Only for open orders; null once the order is finished. */
    readiness: ComponentReadiness | null;
  }[];
  outputLots: { id: string; lotNumber: string; quantity: number; qcStatus: string; producedAt: string }[];
  /** Components still to issue that stock at the location does not cover. */
  shortComponents: number | null;
}
