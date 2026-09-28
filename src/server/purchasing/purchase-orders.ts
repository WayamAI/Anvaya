import { startOfUtcDay } from "@/server/inventory/lots";

/**
 * Purchase orders — the rules, free of the database.
 *
 * Statuses are the schema's own; "overdue" is derived. Received progress is
 * weighted by value so a PO whose lines are in different units (kg and
 * pieces) still has one meaningful percentage.
 */

export const PO_STATUSES = ["DRAFT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** Committed and still able to deliver: what counts as incoming supply. */
export const OPEN_PO_STATUSES: readonly PoStatus[] = ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];
export const isOpenPo = (status: PoStatus | string) => (OPEN_PO_STATUSES as readonly string[]).includes(status);

const qty6 = (n: number) => Math.round(n * 1e6) / 1e6;

export interface PoLineFacts {
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  /** ISO date. */
  expectedDeliveryDate: string;
}

/** Still to arrive on a line; an over-receipt leaves nothing outstanding. */
export function outstandingQty(orderedQty: number, receivedQty: number): number {
  return qty6(Math.max(0, orderedQty - receivedQty));
}

/**
 * Share of the ordered value received, 0–100 to one decimal. Receipts beyond
 * a line's ordered quantity do not count. Null when nothing has a value
 * (no lines, or every price zero) — a percentage of nothing.
 */
export function receivedPct(lines: Pick<PoLineFacts, "orderedQty" | "receivedQty" | "unitPrice">[]): number | null {
  const ordered = lines.reduce((s, l) => s + Math.max(0, l.orderedQty) * l.unitPrice, 0);
  if (ordered <= 0) return null;
  const received = lines.reduce((s, l) => s + Math.min(Math.max(0, l.receivedQty), Math.max(0, l.orderedQty)) * l.unitPrice, 0);
  return Math.round((received / ordered) * 1000) / 10;
}

/** A line past its expected date with quantity still to come. */
export function isLineOverdue(line: PoLineFacts, asOf: Date): boolean {
  return outstandingQty(line.orderedQty, line.receivedQty) > 0 &&
    new Date(`${line.expectedDeliveryDate}T00:00:00Z`).getTime() < startOfUtcDay(asOf).getTime();
}

/** An open PO with at least one overdue line. */
export function isPoOverdue(status: PoStatus, lines: PoLineFacts[], asOf: Date): boolean {
  return isOpenPo(status) && lines.some((l) => isLineOverdue(l, asOf));
}

export interface Delivered {
  date: string;
  /** ACTUAL is the PO's recorded delivery date; RECEIPT the latest goods receipt. */
  source: "ACTUAL" | "RECEIPT";
}

/** The recorded delivery date, else the latest goods receipt date, else null. */
export function deliveredDate(actualDeliveryDate: string | null, receiptDates: string[]): Delivered | null {
  if (actualDeliveryDate) return { date: actualDeliveryDate, source: "ACTUAL" };
  if (!receiptDates.length) return null;
  return { date: [...receiptDates].sort().at(-1)!, source: "RECEIPT" };
}

/** The stored total agrees with its lines, to the paisa. */
export function totalMatchesLines(totalAmount: number, lineTotals: number[]): boolean {
  return Math.abs(totalAmount - lineTotals.reduce((s, t) => s + t, 0)) < 0.01;
}

export type PoCounts = Record<"all" | "overdue" | PoStatus, number>;

export function poCounts(orders: { status: PoStatus; overdue: boolean }[]): PoCounts {
  const counts = Object.fromEntries(PO_STATUSES.map((s) => [s, 0])) as PoCounts;
  counts.all = orders.length;
  counts.overdue = 0;
  for (const o of orders) {
    counts[o.status] += 1;
    if (o.overdue) counts.overdue += 1;
  }
  return counts;
}

/* ---- Response shapes (shared with the client as types only) ------------------ */

export interface PurchaseOrderRow {
  id: string;
  orderNumber: string;
  vendor: { id: string; code: string; name: string; isApproved: boolean };
  location: { id: string; name: string };
  orderDate: string;
  expectedDeliveryDate: string;
  status: PoStatus;
  totalAmount: number;
  currencyCode: string;
  lineCount: number;
  receivedPct: number | null;
  overdue: boolean;
  delivered: Delivered | null;
  /** The stored total disagrees with the sum of its lines. */
  totalMismatch: boolean;
}

export interface PurchaseOrderList {
  asOf: string;
  orders: PurchaseOrderRow[];
  counts: PoCounts;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  createdBy: { name: string; email: string };
  approvedBy: { name: string; email: string } | null;
  approvedAt: string | null;
  notes: string | null;
  lines: {
    lineNumber: number;
    material: { id: string; code: string; name: string };
    uom: string;
    orderedQty: number;
    receivedQty: number;
    outstandingQty: number;
    unitPrice: number;
    lineTotal: number;
    expectedDeliveryDate: string;
    overdue: boolean;
  }[];
  receipts: {
    id: string;
    grnNumber: string;
    receiptDate: string;
    location: string;
    lines: { lineNumber: number; materialCode: string; receivedQty: number; uom: string; lotNumber: string | null; inspectionStatus: string }[];
  }[];
}
