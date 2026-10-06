import { Prisma } from "@prisma/client";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import type { PoStatus } from "./purchase-orders";

/**
 * Purchase order and goods receipt — the write rules, free of the database.
 *
 * Lifecycle:
 *
 *   DRAFT ──approve──▶ APPROVED ──send──▶ ORDERED
 *     │                   │                 │
 *     │                   └────receive──────┴──▶ PARTIALLY_RECEIVED ──▶ FULLY_RECEIVED
 *     └──────────── cancel (any open state) ───────────▶ CANCELLED
 *
 * Only a DRAFT can be edited or deleted: once approved, what the vendor was
 * promised is fixed, and changing it means cancelling and raising a new PO.
 * Receiving is allowed from APPROVED as well as ORDERED because goods do turn
 * up before the "sent" click is recorded, and refusing them at the dock
 * helps nobody.
 *
 * Cancelling a partially received PO cancels the remainder: what arrived
 * stays received, and the outstanding quantity stops counting as supply.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

export const EDITABLE_PO: readonly PoStatus[] = ["DRAFT"];
export const RECEIVABLE_PO: readonly PoStatus[] = ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];
export const CANCELLABLE_PO: readonly PoStatus[] = ["DRAFT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

type Transition = "edit" | "delete" | "approve" | "send" | "cancel" | "receive";

const ALLOWED: Record<Transition, readonly PoStatus[]> = {
  edit: EDITABLE_PO,
  delete: EDITABLE_PO,
  approve: ["DRAFT"],
  send: ["APPROVED"],
  cancel: CANCELLABLE_PO,
  receive: RECEIVABLE_PO,
};

const VERB: Record<Transition, string> = {
  edit: "edited", delete: "deleted", approve: "approved", send: "sent to the vendor",
  cancel: "cancelled", receive: "received against",
};

/** Throws 409 naming the current status when the transition is not allowed. */
export function assertPoTransition(status: PoStatus, action: Transition, orderNumber: string): void {
  if (!ALLOWED[action].includes(status)) {
    const allowed = ALLOWED[action].join(" or ");
    throw AppError.conflict(
      `${orderNumber} is ${status} and cannot be ${VERB[action]}; it must be ${allowed}`,
      { status, action },
    );
  }
}

/** Line total and PO total, in Decimal, rounded to the money column's 4 places. */
export function lineTotal(qty: Prisma.Decimal.Value, unitPrice: Prisma.Decimal.Value): Prisma.Decimal {
  return D(qty).times(unitPrice).toDecimalPlaces(4);
}

export function orderTotal(lines: { orderedQty: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value }[]): Prisma.Decimal {
  return lines.reduce((s, l) => s.plus(lineTotal(l.orderedQty, l.unitPrice)), ZERO);
}

/**
 * A material may be on a PO more than once only for different delivery
 * dates — MRP's time-phased orders. Twice on one date is a data-entry slip
 * the receipt screen could not tell apart, so it is refused. A line without
 * its own date is due on the header's.
 */
export function duplicateLineProblems(
  lines: { materialId: string; expectedDeliveryDate?: string }[],
  headerExpected: string,
): ErrorDetail[] {
  const first = new Map<string, number>();
  const problems: ErrorDetail[] = [];
  lines.forEach((l, i) => {
    const date = l.expectedDeliveryDate ?? headerExpected;
    const key = `${l.materialId}|${date}`;
    const earlier = first.get(key);
    if (earlier === undefined) first.set(key, i);
    else problems.push({ path: `lines.${i}.materialId`, message: `is already on line ${earlier + 1} for delivery on ${date}; combine the quantities` });
  });
  return problems;
}

/** Money columns are Decimal(18,4): fourteen integer digits. */
const MONEY_LIMIT = D("1e14");

/**
 * Line and order totals too large for the money columns. Quantity and price
 * are each bounded at the door; their product and the sum can still exceed
 * what can be stored, which must be a 422, not a database error.
 */
export function amountProblems(lines: { orderedQty: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value }[]): ErrorDetail[] {
  const problems: ErrorDetail[] = [];
  lines.forEach((l, i) => {
    if (lineTotal(l.orderedQty, l.unitPrice).gte(MONEY_LIMIT)) {
      problems.push({ path: `lines.${i}.unitPrice`, message: "makes the line total too large to record" });
    }
  });
  if (!problems.length && orderTotal(lines).gte(MONEY_LIMIT)) {
    problems.push({ path: "lines", message: "the order total is too large to record" });
  }
  return problems;
}

/** Status after a receipt, from every line's ordered and received quantities. */
export function statusAfterReceipt(lines: { orderedQty: Prisma.Decimal.Value; receivedQty: Prisma.Decimal.Value }[]): PoStatus {
  const complete = lines.every((l) => D(l.receivedQty).gte(l.orderedQty));
  return complete ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
}

/* ---- Receipt planning -------------------------------------------------- */

export interface ReceivablePoLine {
  id: string;
  lineNumber: number;
  orderedQty: Prisma.Decimal;
  receivedQty: Prisma.Decimal;
  materialCode: string;
  isBatchTracked: boolean;
}

export interface ReceiptLineInput {
  purchaseOrderLineId: string;
  receivedQty: number;
  rejectedQty?: number;
  inspectionStatus?: "PENDING" | "APPROVED" | "QUARANTINE";
}

export interface PlannedReceiptLine {
  poLine: ReceivablePoLine;
  accepted: Prisma.Decimal;
  rejected: Prisma.Decimal;
  inspectionStatus: "PENDING" | "APPROVED" | "QUARANTINE";
  receivedAfter: Prisma.Decimal;
}

/**
 * Check a receipt against the PO before anything is written.
 *
 * `receivedQty` is what is accepted into stock; `rejectedQty` is refused at
 * the dock and goes back on the vendor's truck — recorded on the receipt,
 * never stocked, and not counted against the PO. Accepted quantity may
 * exceed the line's outstanding quantity only by the company's tolerance.
 *
 * Quality: a batch-tracked material defaults to PENDING inspection and its
 * stock is held until the lot is released. A material without lots has
 * nothing to release later, so it can only be received APPROVED.
 *
 * All problems are collected and reported together, keyed by line, so a
 * form can mark every bad row at once.
 */
export function planReceipt(
  poLines: ReceivablePoLine[],
  input: ReceiptLineInput[],
  tolerancePct: number,
): PlannedReceiptLine[] {
  const byId = new Map(poLines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const problems: ErrorDetail[] = [];
  const planned: PlannedReceiptLine[] = [];

  input.forEach((line, i) => {
    const path = `lines.${i}`;
    const poLine = byId.get(line.purchaseOrderLineId);
    if (!poLine) {
      problems.push({ path: `${path}.purchaseOrderLineId`, message: "is not a line of this purchase order" });
      return;
    }
    if (seen.has(poLine.id)) {
      problems.push({ path: `${path}.purchaseOrderLineId`, message: `line ${poLine.lineNumber} appears more than once` });
      return;
    }
    seen.add(poLine.id);

    const accepted = D(line.receivedQty).toDecimalPlaces(6);
    const rejected = D(line.rejectedQty ?? 0).toDecimalPlaces(6);
    if (accepted.plus(rejected).lte(0)) {
      problems.push({ path: `${path}.receivedQty`, message: "receive or reject a quantity greater than zero" });
      return;
    }

    const outstanding = Prisma.Decimal.max(ZERO, poLine.orderedQty.minus(poLine.receivedQty));
    const ceiling = poLine.orderedQty.times(D(1).plus(D(tolerancePct).div(100))).minus(poLine.receivedQty);
    if (accepted.gt(ceiling)) {
      problems.push({
        path: `${path}.receivedQty`,
        message: tolerancePct > 0
          ? `${poLine.materialCode}: ${accepted} exceeds the outstanding ${outstanding} plus ${tolerancePct}% tolerance`
          : `${poLine.materialCode}: ${accepted} exceeds the outstanding ${outstanding}`,
      });
      return;
    }

    const inspectionStatus = line.inspectionStatus ?? (poLine.isBatchTracked ? "PENDING" : "APPROVED");
    if (!poLine.isBatchTracked && inspectionStatus !== "APPROVED" && accepted.gt(0)) {
      problems.push({
        path: `${path}.inspectionStatus`,
        message: `${poLine.materialCode} is not batch tracked, so it cannot be held for inspection; receive it APPROVED or reject it`,
      });
      return;
    }

    planned.push({ poLine, accepted, rejected, inspectionStatus, receivedAfter: poLine.receivedQty.plus(accepted) });
  });

  if (problems.length) throw AppError.unprocessable("The receipt cannot be posted", problems);
  return planned;
}

/* ---- Lot quality decisions --------------------------------------------- */

export type QcDecision = "APPROVED" | "QUARANTINE" | "REJECTED";

/**
 * Which quality decisions a lot can take from where it is.
 *
 * REJECTED is final: the lot's remaining stock leaves the plant (returned to
 * the vendor, or scrapped when it was made in-house) and it cannot be
 * reinstated — a reversal is a new receipt, with its own paperwork.
 */
export function assertQcTransition(from: string, to: QcDecision, lotNumber: string): void {
  if (from === "REJECTED") throw AppError.conflict(`Lot ${lotNumber} is REJECTED; a rejection cannot be reversed`);
  if (from === to) throw AppError.conflict(`Lot ${lotNumber} is already ${to}`);
}
