/**
 * Lots and traceability — the rules, free of the database.
 *
 * A lot is either purchased (created by a goods receipt) or produced (created
 * by a work order). The schema records the second link through the stock
 * ledger rather than a column: a PRODUCTION_RECEIPT movement carrying the lot
 * and `referenceType: "WORK_ORDER"`. Dispatches to customers are ISSUE
 * movements carrying the lot and `referenceType: "SALES_ORDER_LINE"`.
 */

/** `StockMovement.referenceType` values the trace understands. */
export const MOVEMENT_REF = {
  WORK_ORDER: "WORK_ORDER",
  SALES_ORDER_LINE: "SALES_ORDER_LINE",
  GOODS_RECEIPT_LINE: "GOODS_RECEIPT_LINE",
  /** A lot's stock leaving on a quality rejection (RETURN or SCRAP). */
  LOT_QC: "LOT_QC",
  INVENTORY_ADJUSTMENT: "INVENTORY_ADJUSTMENT",
} as const;

/** Lots expiring within this many days are flagged. */
export const EXPIRY_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Midnight UTC — lot dates are calendar dates, so time of day must not count. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);
}

export type QcStatus = "PENDING" | "APPROVED" | "QUARANTINE" | "REJECTED";

/** Quarantined or rejected stock needs containment. */
export function needsContainment(qcStatus: QcStatus): boolean {
  return qcStatus === "QUARANTINE" || qcStatus === "REJECTED";
}

/* ---- Expiry ------------------------------------------------------------ */

export interface ExpiryCandidate {
  remainingQty: number;
  expiryDate: Date | null;
}

/**
 * Days until expiry, or null when the lot has no expiry date. A lot with
 * nothing left is never flagged, whatever its date.
 */
export function daysToExpiry(lot: ExpiryCandidate, asOf: Date): number | null {
  if (!lot.expiryDate) return null;
  return daysBetween(asOf, lot.expiryDate);
}

/** Still holding stock, and expiring today or within the window. */
export function isExpiringSoon(lot: ExpiryCandidate, asOf: Date, windowDays = EXPIRY_WINDOW_DAYS): boolean {
  if (lot.remainingQty <= 0) return false;
  const days = daysToExpiry(lot, asOf);
  return days !== null && days >= 0 && days <= windowDays;
}

/** Remaining quantity at the material's standard cost; null when there is no cost. */
export function lotValue(remainingQty: number, standardCost: number | null): number | null {
  if (standardCost === null) return null;
  return Math.max(0, remainingQty) * standardCost;
}

/* ---- Trace completeness -------------------------------------------------- */

/** What the completeness rules need to know about one lot. */
export interface TraceFacts {
  /** The receipt that created the lot, when purchased. */
  receipt: { coaReference: string | null } | null;
  /** The work order that created the lot, when produced. */
  production: {
    /** One entry per component the work order required. */
    components: { lot: { receipt: { coaReference: string | null } | null } | null }[];
  } | null;
  consumedQty: number;
  /**
   * Quantity out of this lot that a record explains: ledger issues carrying
   * the lot, plus quantities issued to work orders against it.
   */
  accountedOutQty: number;
}

/** A receipt with a certificate of analysis is a complete supplier link. */
function receiptComplete(receipt: { coaReference: string | null } | null): boolean {
  return receipt !== null && !!receipt.coaReference;
}

/**
 * Backward: can this lot be walked back to a supplier certificate?
 *
 * - Purchased: it has a receipt, and the receipt has a CoA.
 * - Produced: every component the work order needed is tied to a lot, and
 *   each of those lots has a receipt with a CoA. A component with no lot
 *   recorded breaks the chain.
 * - Neither: not traceable.
 */
export function isBackwardComplete(facts: TraceFacts): boolean {
  if (facts.receipt) return receiptComplete(facts.receipt);
  if (facts.production) {
    const { components } = facts.production;
    return components.length > 0 && components.every((c) => c.lot !== null && receiptComplete(c.lot.receipt));
  }
  return false;
}

/**
 * Forward: is everything that left this lot accounted for?
 *
 * Null when nothing has left it — there is nothing to account for, so the lot
 * is neither complete nor incomplete and is left out of the percentage.
 */
export function isForwardComplete(facts: TraceFacts): boolean | null {
  if (facts.consumedQty <= 0) return null;
  return facts.accountedOutQty >= facts.consumedQty - 1e-6;
}

export interface TraceCompleteness {
  /** Null when there are no lots. */
  backwardPct: number | null;
  /** Null when no lot has had anything consumed from it. */
  forwardPct: number | null;
  lotCount: number;
  forwardEligible: number;
}

export function traceCompleteness(lots: TraceFacts[]): TraceCompleteness {
  const backward = lots.filter(isBackwardComplete).length;
  const forward = lots.map(isForwardComplete).filter((v): v is boolean => v !== null);
  const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

  return {
    backwardPct: pct(backward, lots.length),
    forwardPct: pct(forward.filter(Boolean).length, forward.length),
    lotCount: lots.length,
    forwardEligible: forward.length,
  };
}

/* ---- Response shapes (shared with the client as types only) --------------- */

export interface LotRef {
  id: string;
  lotNumber: string;
}

export interface VendorRef {
  id: string;
  code: string;
  name: string;
  /** On the Approved Supplier List. */
  isApproved: boolean;
}

export interface ReceiptRef {
  goodsReceiptId: string;
  grnNumber: string;
  receiptDate: string;
  purchaseOrderNumber: string;
  coaReference: string | null;
  inspectionStatus: QcStatus;
  inspectionDate: string | null;
  inspectorName: string | null;
}

export interface LotRow {
  id: string;
  lotNumber: string;
  material: { id: string; code: string; name: string; kind: string };
  uom: string;
  location: { id: string; code: string; name: string };
  storageLocation: string | null;
  bin: string | null;
  receivedQty: number;
  consumedQty: number;
  remainingQty: number;
  /** Receipt date for a purchased lot; production date for a produced one. */
  receiptDate: string;
  expiryDate: string | null;
  qcStatus: QcStatus;
  source: "PURCHASED" | "PRODUCED" | "UNKNOWN";
  vendor: VendorRef | null;
  supplierLotNumber: string | null;
  coaReference: string | null;
  /** For a produced lot: the order and the BOM revision it was built to. */
  workOrder: { id: string; orderNumber: string; bomCode: string | null; bomVersion: string | null } | null;
  /** Components the producing work order required; null for purchased lots. */
  inputCount: number | null;
  ageDays: number;
  value: number | null;
}

export interface TraceInput {
  material: { id: string; code: string; name: string; kind: string };
  uom: string;
  requiredQty: number;
  issuedQty: number;
  /** Null when no lot was recorded against the component. */
  lot: (LotRef & {
    qcStatus: QcStatus;
    supplierLotNumber: string | null;
    coaReference: string | null;
    storageLocation: string | null;
    bin: string | null;
    vendor: VendorRef | null;
    receipt: ReceiptRef | null;
  }) | null;
  suspect: boolean;
  nonApprovedVendor: boolean;
}

export interface Dispatch {
  salesOrderId: string;
  orderNumber: string;
  customer: string;
  quantity: number;
  invoiceNumber: string | null;
  deliveryStatus: "PENDING" | "IN_TRANSIT" | "DELIVERED";
  dispatchedAt: string;
}

export interface LotUsage {
  workOrderId: string;
  orderNumber: string;
  status: string;
  product: { code: string; name: string };
  requiredQty: number;
  issuedQty: number;
}

export interface LotDetail extends LotRow {
  releaseDate: string | null;
  releasedBy: string | null;
  receipt: ReceiptRef | null;
  production: {
    workOrderId: string;
    orderNumber: string;
    status: string;
    producedQty: number;
    bom: { code: string; name: string; version: string } | null;
    inputs: TraceInput[];
  } | null;
  dispatches: Dispatch[];
  usedIn: LotUsage[];
}

export interface ExpiringLot {
  id: string;
  lotNumber: string;
  material: string;
  remainingQty: number;
  uom: string;
  expiryDate: string;
  daysLeft: number;
  value: number | null;
}

export interface LotIndicators extends TraceCompleteness {
  asOf: string;
  containmentLots: number;
  expiring: ExpiringLot[];
  expiryWindowDays: number;
}
