import { startOfUtcDay } from "@/server/inventory/lots";

/**
 * Sales orders — the rules, free of the database.
 *
 * Statuses are the schema's own; "overdue" is derived. The schema has no
 * priority and no "new" status, so neither appears here.
 */

export const SO_STATUSES = ["CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;
export type SoStatus = (typeof SO_STATUSES)[number];
export type DeliveryStatus = "PENDING" | "IN_TRANSIT" | "DELIVERED";
export type CustomerType = "DISTRIBUTOR" | "MODERN_TRADE" | "ECOMMERCE" | "INSTITUTIONAL";

/** Not yet delivered and not abandoned. */
export const isOpenSo = (status: SoStatus) => status !== "DELIVERED" && status !== "CANCELLED";

/** Still to leave the plant — the orders that can fall behind their date. */
export const isAwaitingDispatch = (status: SoStatus) => status === "CONFIRMED" || status === "PROCESSING";

const qty6 = (n: number) => Math.round(n * 1e6) / 1e6;
const DAY_MS = 86_400_000;
const isoDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();

/** Still to ship on a line; an over-shipment leaves nothing open. */
export function openQty(quantity: number, shippedQty: number): number {
  return qty6(Math.max(0, quantity - shippedQty));
}

/** On hand less what is reserved or held by quality, never negative. */
export function availableQty(onHand: number, reserved: number, quarantine: number): number {
  return qty6(Math.max(0, onHand - reserved - quarantine));
}

export interface SoLineFacts {
  quantity: number;
  shippedQty: number;
  /** ISO date. */
  requiredDate: string;
}

/** A line past its required date with quantity still to ship. */
export function isSoLineOverdue(line: SoLineFacts, asOf: Date): boolean {
  return openQty(line.quantity, line.shippedQty) > 0 && isoDay(line.requiredDate) < startOfUtcDay(asOf).getTime();
}

/** An order still awaiting dispatch with at least one overdue line. */
export function isSoOverdue(status: SoStatus, lines: SoLineFacts[], asOf: Date): boolean {
  return isAwaitingDispatch(status) && lines.some((l) => isSoLineOverdue(l, asOf));
}

export type SoCounts = Record<"all" | "overdue" | SoStatus, number>;

export function soCounts(orders: { status: SoStatus; overdue: boolean }[]): SoCounts {
  const counts = Object.fromEntries(SO_STATUSES.map((s) => [s, 0])) as SoCounts;
  counts.all = orders.length;
  counts.overdue = 0;
  for (const o of orders) {
    counts[o.status] += 1;
    if (o.overdue) counts.overdue += 1;
  }
  return counts;
}

export interface CountValue {
  count: number;
  value: number;
}

export interface SoKpis {
  open: CountValue;
  /** Awaiting dispatch, required between the as-of day and seven days after. */
  dueNext7Days: CountValue;
  /** Booked on the as-of day. */
  bookedToday: CountValue;
  /** Value shipped from the first of the as-of month to the end of the as-of day. */
  dispatchedMtd: number;
}

export interface SoKpiInput {
  orders: { status: SoStatus; orderDate: string; requiredDate: string; totalAmount: number }[];
  /** Ledger issues against sales order lines, quantity as a positive number. */
  dispatches: { occurredAt: string; quantity: number; unitPrice: number }[];
  asOf: Date;
}

const money = (n: number) => Math.round(n * 1e4) / 1e4;

function tally(rows: { totalAmount: number }[]): CountValue {
  return { count: rows.length, value: money(rows.reduce((s, r) => s + r.totalAmount, 0)) };
}

export function soKpis({ orders, dispatches, asOf }: SoKpiInput): SoKpis {
  const today = startOfUtcDay(asOf).getTime();
  const monthStart = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1);
  const endOfToday = today + DAY_MS;

  return {
    open: tally(orders.filter((o) => isOpenSo(o.status))),
    dueNext7Days: tally(orders.filter((o) => {
      const due = isoDay(o.requiredDate);
      return isAwaitingDispatch(o.status) && due >= today && due <= today + 7 * DAY_MS;
    })),
    bookedToday: tally(orders.filter((o) => o.status !== "CANCELLED" && isoDay(o.orderDate) === today)),
    dispatchedMtd: money(dispatches
      .filter((d) => {
        const t = new Date(d.occurredAt).getTime();
        return t >= monthStart && t < endOfToday;
      })
      .reduce((s, d) => s + d.quantity * d.unitPrice, 0)),
  };
}

/* ---- Response shapes (shared with the client as types only) ------------------ */

export interface SalesOrderRow {
  id: string;
  orderNumber: string;
  customer: { id: string; code: string; name: string; type: CustomerType };
  orderDate: string;
  requiredDate: string;
  status: SoStatus;
  deliveryStatus: DeliveryStatus;
  invoiceNumber: string | null;
  dispatchDate: string | null;
  totalAmount: number;
  currencyCode: string;
  lineCount: number;
  overdue: boolean;
  /** The stored total disagrees with the sum of its lines. */
  totalMismatch: boolean;
}

export interface SalesOrderList {
  asOf: string;
  orders: SalesOrderRow[];
  counts: SoCounts;
  kpis: SoKpis;
}

export interface SalesOrderDetail extends SalesOrderRow {
  asOf: string;
  notes: string | null;
  lines: {
    lineNumber: number;
    material: { id: string; code: string; name: string };
    uom: string;
    location: { id: string; name: string };
    quantity: number;
    shippedQty: number;
    openQty: number;
    unitPrice: number;
    lineTotal: number;
    requiredDate: string;
    overdue: boolean;
    /** The lots this line shipped from, as the ledger records them. */
    lots: { id: string; lotNumber: string; quantity: number }[];
    /** Stock of the material at the line's location; null when no balance is recorded. */
    stock: { onHand: number; reserved: number; quarantine: number; available: number } | null;
    /**
     * Open work orders for the same material and location. A work order is
     * not linked to a sales order, so this is supply for the material, not
     * production for this order.
     */
    openWorkOrders: { id: string; orderNumber: string; status: string; plannedQty: number; producedQty: number; plannedEndDate: string }[];
  }[];
}
