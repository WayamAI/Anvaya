import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/server/errors/app-error";
import {
  allocateFefo, assertSoTransition, lotShippable, planDispatch, statusAfterDispatch,
  type CandidateLot, type DispatchableLine,
} from "./so-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const lot = (over: Partial<CandidateLot> & { id: string }): CandidateLot => ({
  lotNumber: over.id.toUpperCase(), remainingQty: D(10), qcStatus: "APPROVED", expiryDate: null, receiptDate: "2026-01-01", ...over,
});

const details = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (AppError.is(e)) return e.details?.map((d) => `${d.path}: ${d.message}`);
    throw e;
  }
  throw new Error("expected a failure");
};

describe("assertSoTransition", () => {
  it("follows the documented lifecycle", () => {
    expect(() => assertSoTransition("CONFIRMED", "edit", "SO-1")).not.toThrow();
    expect(() => assertSoTransition("PROCESSING", "dispatch", "SO-1")).not.toThrow();
    expect(() => assertSoTransition("DISPATCHED", "deliver", "SO-1")).not.toThrow();
    expect(() => assertSoTransition("PROCESSING", "edit", "SO-1")).toThrow(/is PROCESSING and cannot be edited/);
    expect(() => assertSoTransition("DISPATCHED", "cancel", "SO-1")).toThrow(/cannot be cancelled/);
    expect(() => assertSoTransition("CANCELLED", "dispatch", "SO-1")).toThrow(/cannot be dispatched against/);
    expect(() => assertSoTransition("CONFIRMED", "deliver", "SO-1")).toThrow(/must be DISPATCHED/);
  });

  it("is DISPATCHED only when every line has shipped in full", () => {
    expect(statusAfterDispatch([{ quantity: 5, shippedQty: 5 }, { quantity: 2, shippedQty: 3 }])).toBe("DISPATCHED");
    expect(statusAfterDispatch([{ quantity: 5, shippedQty: 5 }, { quantity: 2, shippedQty: 1 }])).toBe("PROCESSING");
  });
});

describe("lotShippable", () => {
  it("needs a released, unexpired lot with stock", () => {
    expect(lotShippable(lot({ id: "a" }), "2026-05-01")).toBeNull();
    expect(lotShippable(lot({ id: "a", qcStatus: "PENDING" }), "2026-05-01")).toMatch(/PENDING, not released/);
    expect(lotShippable(lot({ id: "a", remainingQty: D(0) }), "2026-05-01")).toMatch(/nothing remaining/);
    expect(lotShippable(lot({ id: "a", expiryDate: "2026-04-30" }), "2026-05-01")).toMatch(/expired on 2026-04-30/);
    // Shippable on its expiry day itself.
    expect(lotShippable(lot({ id: "a", expiryDate: "2026-05-01" }), "2026-05-01")).toBeNull();
  });
});

describe("allocateFefo", () => {
  const lots = [
    lot({ id: "late", expiryDate: "2027-06-01", remainingQty: D(10) }),
    lot({ id: "none-old", expiryDate: null, receiptDate: "2025-01-01", remainingQty: D(10) }),
    lot({ id: "soon", expiryDate: "2026-06-01", remainingQty: D(4) }),
    lot({ id: "none-new", expiryDate: null, receiptDate: "2026-02-01", remainingQty: D(10) }),
    lot({ id: "held", expiryDate: "2026-05-15", qcStatus: "QUARANTINE" }),
    lot({ id: "dead", expiryDate: "2026-04-01" }),
  ];

  it("ships the soonest-expiring released lots first, then undated lots oldest first", () => {
    const draws = allocateFefo(lots, D(20), "2026-05-01", "FG-1");
    expect(draws.map((d) => [d.lotId, d.quantity.toNumber()])).toEqual([["soon", 4], ["late", 10], ["none-old", 6]]);
  });

  it("skips held and expired lots, and refuses when released stock is short", () => {
    expect(() => allocateFefo(lots, D(35), "2026-05-01", "FG-1")).toThrow(/Not enough released, unexpired FG-1 to ship 35: 34 available/);
  });
});

describe("planDispatch", () => {
  const line = (over: Partial<DispatchableLine> = {}): DispatchableLine => ({
    id: "l1", lineNumber: 1, quantity: D(100), shippedQty: D(30), materialCode: "FG-1", ...over,
  });

  it("allows up to the open quantity, or beyond it by the tolerance", () => {
    expect(planDispatch([line()], [{ salesOrderLineId: "l1", quantity: 70 }], 0)[0].shippedAfter.toNumber()).toBe(100);
    expect(details(() => planDispatch([line()], [{ salesOrderLineId: "l1", quantity: 71 }], 0)))
      .toEqual(["lines.0.quantity: FG-1: 71 exceeds the open 70"]);
    expect(planDispatch([line()], [{ salesOrderLineId: "l1", quantity: 75 }], 5)[0].shippedAfter.toNumber()).toBe(105);
  });

  it("requires named lots to add up to the line, each once", () => {
    expect(details(() => planDispatch([line()], [{ salesOrderLineId: "l1", quantity: 10, lots: [{ lotId: "a", quantity: 6 }] }], 0)))
      .toEqual(["lines.0.lots: lot quantities add up to 6, not 10"]);
    expect(details(() => planDispatch([line()], [{ salesOrderLineId: "l1", quantity: 10, lots: [{ lotId: "a", quantity: 5 }, { lotId: "a", quantity: 5 }] }], 0)))
      .toEqual(["lines.0.lots.1.lotId: appears more than once"]);
  });

  it("reports foreign and repeated lines together", () => {
    expect(details(() => planDispatch([line()], [
      { salesOrderLineId: "x", quantity: 1 }, { salesOrderLineId: "l1", quantity: 1 }, { salesOrderLineId: "l1", quantity: 1 },
    ], 0))).toEqual([
      "lines.0.salesOrderLineId: is not a line of this sales order",
      "lines.2.salesOrderLineId: line 1 appears more than once",
    ]);
  });
});
