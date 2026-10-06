import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/server/errors/app-error";
import {
  amountProblems, assertPoTransition, assertQcTransition, duplicateLineProblems, lineTotal, orderTotal, planReceipt, statusAfterReceipt,
  type ReceivablePoLine,
} from "./po-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const line = (over: Partial<ReceivablePoLine> = {}): ReceivablePoLine => ({
  id: "l1", lineNumber: 1, orderedQty: D(100), receivedQty: D(0), materialCode: "RM-1", isBatchTracked: true, ...over,
});

function problems(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (AppError.is(e)) return e.details?.map((d) => `${d.path}: ${d.message}`) ?? [e.message];
    throw e;
  }
  throw new Error("expected a failure");
}

describe("assertPoTransition", () => {
  it("allows the documented lifecycle", () => {
    expect(() => assertPoTransition("DRAFT", "edit", "PO-1")).not.toThrow();
    expect(() => assertPoTransition("DRAFT", "approve", "PO-1")).not.toThrow();
    expect(() => assertPoTransition("APPROVED", "send", "PO-1")).not.toThrow();
    for (const s of ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"] as const) {
      expect(() => assertPoTransition(s, "receive", "PO-1")).not.toThrow();
      expect(() => assertPoTransition(s, "cancel", "PO-1")).not.toThrow();
    }
  });

  it("refuses with 409 naming the status", () => {
    try {
      assertPoTransition("APPROVED", "edit", "PO-2026-0001");
      throw new Error("no throw");
    } catch (e) {
      expect(AppError.is(e) && e.status).toBe(409);
      expect((e as Error).message).toBe("PO-2026-0001 is APPROVED and cannot be edited; it must be DRAFT");
    }
    expect(() => assertPoTransition("DRAFT", "receive", "PO-1")).toThrow(/cannot be received against/);
    expect(() => assertPoTransition("FULLY_RECEIVED", "cancel", "PO-1")).toThrow(/cannot be cancelled/);
    expect(() => assertPoTransition("CANCELLED", "approve", "PO-1")).toThrow();
  });
});

describe("totals", () => {
  it("computes in Decimal, without float drift", () => {
    expect(lineTotal(0.1, 0.2).toString()).toBe("0.02");
    // Each line is rounded to the money column's 4 places before summing:
    // 0.333333 × 3 = 0.999999 → 1.0000.
    expect(orderTotal([{ orderedQty: 600, unitPrice: 145 }, { orderedQty: 0.333333, unitPrice: 3 }]).toString()).toBe("87001");
  });
});

describe("statusAfterReceipt", () => {
  it("is FULLY_RECEIVED only when every line is complete", () => {
    expect(statusAfterReceipt([{ orderedQty: 10, receivedQty: 10 }, { orderedQty: 5, receivedQty: 6 }])).toBe("FULLY_RECEIVED");
    expect(statusAfterReceipt([{ orderedQty: 10, receivedQty: 10 }, { orderedQty: 5, receivedQty: 4 }])).toBe("PARTIALLY_RECEIVED");
  });
});

describe("planReceipt", () => {
  it("accepts up to the outstanding quantity and defaults batch-tracked lines to PENDING", () => {
    const [p] = planReceipt([line({ receivedQty: D(40) })], [{ purchaseOrderLineId: "l1", receivedQty: 60 }], 0);
    expect(p.accepted.toNumber()).toBe(60);
    expect(p.receivedAfter.toNumber()).toBe(100);
    expect(p.inspectionStatus).toBe("PENDING");
  });

  it("refuses over-receipt beyond the tolerance", () => {
    expect(problems(() => planReceipt([line({ receivedQty: D(40) })], [{ purchaseOrderLineId: "l1", receivedQty: 61 }], 0)))
      .toEqual(["lines.0.receivedQty: RM-1: 61 exceeds the outstanding 60"]);
    // 5% of 100 ordered = up to 105 in total.
    expect(planReceipt([line({ receivedQty: D(40) })], [{ purchaseOrderLineId: "l1", receivedQty: 65 }], 5)[0].receivedAfter.toNumber()).toBe(105);
    expect(problems(() => planReceipt([line({ receivedQty: D(40) })], [{ purchaseOrderLineId: "l1", receivedQty: 65.1 }], 5))[0])
      .toMatch(/plus 5% tolerance/);
  });

  it("does not count rejected quantity against the PO", () => {
    const [p] = planReceipt([line()], [{ purchaseOrderLineId: "l1", receivedQty: 100, rejectedQty: 30 }], 0);
    expect(p.receivedAfter.toNumber()).toBe(100);
    expect(p.rejected.toNumber()).toBe(30);
  });

  it("allows a rejection-only line but not an empty one", () => {
    expect(planReceipt([line()], [{ purchaseOrderLineId: "l1", receivedQty: 0, rejectedQty: 5 }], 0)[0].accepted.toNumber()).toBe(0);
    expect(problems(() => planReceipt([line()], [{ purchaseOrderLineId: "l1", receivedQty: 0 }], 0))[0]).toMatch(/greater than zero/);
  });

  it("refuses a quality hold on a material without lots", () => {
    const untracked = line({ isBatchTracked: false });
    expect(planReceipt([untracked], [{ purchaseOrderLineId: "l1", receivedQty: 5 }], 0)[0].inspectionStatus).toBe("APPROVED");
    expect(problems(() => planReceipt([untracked], [{ purchaseOrderLineId: "l1", receivedQty: 5, inspectionStatus: "PENDING" }], 0))[0])
      .toMatch(/not batch tracked/);
  });

  it("reports every bad line at once: foreign lines, duplicates", () => {
    const lines = [line(), line({ id: "l2", lineNumber: 2, materialCode: "RM-2" })];
    expect(problems(() => planReceipt(lines, [
      { purchaseOrderLineId: "other-po-line", receivedQty: 1 },
      { purchaseOrderLineId: "l2", receivedQty: 1 },
      { purchaseOrderLineId: "l2", receivedQty: 1 },
      { purchaseOrderLineId: "l1", receivedQty: 101 },
    ], 0))).toEqual([
      "lines.0.purchaseOrderLineId: is not a line of this purchase order",
      "lines.2.purchaseOrderLineId: line 2 appears more than once",
      "lines.3.receivedQty: RM-1: 101 exceeds the outstanding 100",
    ]);
  });
});

describe("amountProblems", () => {
  it("passes amounts the money columns can hold", () => {
    expect(amountProblems([{ orderedQty: 1000, unitPrice: 250.5 }])).toEqual([]);
  });

  it("refuses a line, or an order, too large to store", () => {
    // 999,999,999 × 999,999,999 ≈ 1e18: past Decimal(18,4)'s 1e14.
    expect(amountProblems([{ orderedQty: 10, unitPrice: 1 }, { orderedQty: 999_999_999, unitPrice: 999_999_999 }])).toEqual([
      { path: "lines.1.unitPrice", message: "makes the line total too large to record" },
    ]);
    // Each line fits, the sum does not.
    const big = { orderedQty: 900_000_000, unitPrice: 100_000 }; // 9e13 each
    expect(amountProblems([big, big])).toEqual([{ path: "lines", message: "the order total is too large to record" }]);
  });
});

describe("duplicateLineProblems", () => {
  const HEADER = "2026-04-10";

  it("allows one material on several lines due on different dates", () => {
    expect(duplicateLineProblems([
      { materialId: "m", expectedDeliveryDate: "2026-04-05" },
      { materialId: "m", expectedDeliveryDate: "2026-04-15" },
      { materialId: "m" }, // the header's date, the 10th
    ], HEADER)).toEqual([]);
  });

  it("refuses one material twice on the same date, a line without a date taking the header's", () => {
    expect(duplicateLineProblems([
      { materialId: "m", expectedDeliveryDate: "2026-04-05" },
      { materialId: "n" },
      { materialId: "m", expectedDeliveryDate: "2026-04-05" },
      { materialId: "n", expectedDeliveryDate: HEADER },
    ], HEADER)).toEqual([
      { path: "lines.2.materialId", message: "is already on line 1 for delivery on 2026-04-05; combine the quantities" },
      { path: "lines.3.materialId", message: "is already on line 2 for delivery on 2026-04-10; combine the quantities" },
    ]);
  });
});

describe("assertQcTransition", () => {
  it("makes rejection final and refuses no-op decisions", () => {
    expect(() => assertQcTransition("PENDING", "APPROVED", "RMB-1")).not.toThrow();
    expect(() => assertQcTransition("APPROVED", "QUARANTINE", "RMB-1")).not.toThrow();
    expect(() => assertQcTransition("REJECTED", "APPROVED", "RMB-1")).toThrow(/cannot be reversed/);
    expect(() => assertQcTransition("APPROVED", "APPROVED", "RMB-1")).toThrow(/already APPROVED/);
  });
});
