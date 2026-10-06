import { Prisma } from "@prisma/client";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import type { SoStatus } from "./sales-orders";

/**
 * Sales orders and dispatch — the write rules, free of the database.
 *
 * Lifecycle:
 *
 *   CONFIRMED ──dispatch (part)──▶ PROCESSING ──dispatch (rest)──▶ DISPATCHED ──deliver──▶ DELIVERED
 *       │                              │
 *       └───────── cancel ─────────────┴──▶ CANCELLED
 *
 * An order is born CONFIRMED (the schema has no draft). It can be edited
 * only while nothing has shipped. A partial dispatch moves it to
 * PROCESSING; shipping every line in full moves it to DISPATCHED and puts
 * the delivery IN_TRANSIT. Cancelling after a partial dispatch cancels the
 * remainder; what shipped stays shipped.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

type Transition = "edit" | "cancel" | "dispatch" | "deliver";

const ALLOWED: Record<Transition, readonly SoStatus[]> = {
  edit: ["CONFIRMED"],
  cancel: ["CONFIRMED", "PROCESSING"],
  dispatch: ["CONFIRMED", "PROCESSING"],
  deliver: ["DISPATCHED"],
};

const VERB: Record<Transition, string> = {
  edit: "edited", cancel: "cancelled", dispatch: "dispatched against", deliver: "marked delivered",
};

export function assertSoTransition(status: SoStatus, action: Transition, orderNumber: string): void {
  if (!ALLOWED[action].includes(status)) {
    throw AppError.conflict(
      `${orderNumber} is ${status} and cannot be ${VERB[action]}; it must be ${ALLOWED[action].join(" or ")}`,
      { status, action },
    );
  }
}

/** Status after a dispatch, from every line's ordered and shipped quantities. */
export function statusAfterDispatch(lines: { quantity: Prisma.Decimal.Value; shippedQty: Prisma.Decimal.Value }[]): SoStatus {
  return lines.every((l) => D(l.shippedQty).gte(l.quantity)) ? "DISPATCHED" : "PROCESSING";
}

/* ---- Lot allocation ---------------------------------------------------- */

export interface CandidateLot {
  id: string;
  lotNumber: string;
  remainingQty: Prisma.Decimal;
  qcStatus: string;
  /** ISO date or null. */
  expiryDate: string | null;
  /** ISO date. */
  receiptDate: string;
}

/** A lot can ship on a date if it is released, has stock and is not expired that day. */
export function lotShippable(lot: CandidateLot, onDate: string): string | null {
  if (lot.qcStatus !== "APPROVED") return `lot ${lot.lotNumber} is ${lot.qcStatus}, not released`;
  if (lot.remainingQty.lte(0)) return `lot ${lot.lotNumber} has nothing remaining`;
  if (lot.expiryDate && lot.expiryDate < onDate) return `lot ${lot.lotNumber} expired on ${lot.expiryDate}`;
  return null;
}

/**
 * First-expiry, first-out: the lots that expire soonest ship first, then the
 * oldest receipts, then by lot number so the choice is deterministic. Lots
 * without an expiry go last among themselves by receipt date. Returns the
 * draw on each lot; throws when released, unexpired stock falls short.
 */
export function allocateFefo(
  lots: CandidateLot[],
  qty: Prisma.Decimal,
  onDate: string,
  materialCode: string,
): { lotId: string; lotNumber: string; quantity: Prisma.Decimal }[] {
  const usable = lots
    .filter((l) => lotShippable(l, onDate) === null)
    .sort((a, b) =>
      (a.expiryDate ?? "9999-12-31").localeCompare(b.expiryDate ?? "9999-12-31") ||
      a.receiptDate.localeCompare(b.receiptDate) ||
      a.lotNumber.localeCompare(b.lotNumber),
    );

  const out: { lotId: string; lotNumber: string; quantity: Prisma.Decimal }[] = [];
  let left = qty;
  for (const lot of usable) {
    if (left.lte(0)) break;
    const take = Prisma.Decimal.min(left, lot.remainingQty);
    out.push({ lotId: lot.id, lotNumber: lot.lotNumber, quantity: take });
    left = left.minus(take);
  }
  if (left.gt(0)) {
    const have = qty.minus(left);
    throw AppError.unprocessable(`Not enough released, unexpired ${materialCode} for ${qty}: ${have} available in lots`, [
      { path: "quantity", message: `only ${have} available in released lots` },
    ]);
  }
  return out;
}

/* ---- Dispatch planning -------------------------------------------------- */

export interface DispatchableLine {
  id: string;
  lineNumber: number;
  quantity: Prisma.Decimal;
  shippedQty: Prisma.Decimal;
  materialCode: string;
}

export interface DispatchLineInput {
  salesOrderLineId: string;
  quantity: number;
  lots?: { lotId: string; quantity: number }[];
}

export interface PlannedDispatchLine {
  line: DispatchableLine;
  quantity: Prisma.Decimal;
  shippedAfter: Prisma.Decimal;
  input: DispatchLineInput;
}

/**
 * Check a dispatch against the order before stock moves: lines belong to
 * the order, appear once, and ship no more than is open plus the company's
 * tolerance. Explicit lot quantities must add up to the line. All problems
 * are reported together.
 */
export function planDispatch(lines: DispatchableLine[], input: DispatchLineInput[], tolerancePct: number): PlannedDispatchLine[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const problems: ErrorDetail[] = [];
  const planned: PlannedDispatchLine[] = [];

  input.forEach((l, i) => {
    const path = `lines.${i}`;
    const line = byId.get(l.salesOrderLineId);
    if (!line) return void problems.push({ path: `${path}.salesOrderLineId`, message: "is not a line of this sales order" });
    if (seen.has(line.id)) return void problems.push({ path: `${path}.salesOrderLineId`, message: `line ${line.lineNumber} appears more than once` });
    seen.add(line.id);

    const qty = D(l.quantity).toDecimalPlaces(6);
    const open = Prisma.Decimal.max(ZERO, line.quantity.minus(line.shippedQty));
    const ceiling = line.quantity.times(D(1).plus(D(tolerancePct).div(100))).minus(line.shippedQty);
    if (qty.gt(ceiling)) {
      return void problems.push({
        path: `${path}.quantity`,
        message: `${line.materialCode}: ${qty} exceeds the open ${open}${tolerancePct > 0 ? ` plus ${tolerancePct}% tolerance` : ""}`,
      });
    }

    if (l.lots?.length) {
      const lotSum = l.lots.reduce((s, x) => s.plus(x.quantity), ZERO);
      if (!lotSum.equals(qty)) {
        return void problems.push({ path: `${path}.lots`, message: `lot quantities add up to ${lotSum}, not ${qty}` });
      }
      const ids = new Set<string>();
      for (const [j, x] of l.lots.entries()) {
        if (ids.has(x.lotId)) return void problems.push({ path: `${path}.lots.${j}.lotId`, message: "appears more than once" });
        ids.add(x.lotId);
      }
    }

    planned.push({ line, quantity: qty, shippedAfter: line.shippedQty.plus(qty), input: l });
  });

  if (problems.length) throw AppError.unprocessable("The dispatch cannot be posted", problems);
  return planned;
}
