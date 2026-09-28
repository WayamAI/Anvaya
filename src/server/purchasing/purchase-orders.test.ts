import { describe, it, expect } from "vitest";
import {
  OPEN_PO_STATUSES, PO_STATUSES, isOpenPo, outstandingQty, receivedPct, isLineOverdue, isPoOverdue,
  deliveredDate, totalMatchesLines, poCounts, type PoLineFacts,
} from "./purchase-orders";

const AS_OF = new Date("2026-09-24T12:00:00Z");
const line = (over: Partial<PoLineFacts> = {}): PoLineFacts => ({
  orderedQty: 800, receivedQty: 0, unitPrice: 185, expectedDeliveryDate: "2026-04-03", ...over,
});

describe("open statuses", () => {
  it("are the committed ones that can still deliver", () => {
    expect(PO_STATUSES.filter(isOpenPo)).toEqual(["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"]);
    expect(OPEN_PO_STATUSES).toEqual(["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"]);
  });
});

describe("outstandingQty", () => {
  it("is ordered less received, never negative", () => {
    expect(outstandingQty(600, 250)).toBe(350);
    expect(outstandingQty(600, 650)).toBe(0);
    expect(outstandingQty(0.3, 0.1)).toBe(0.2);
  });
});

describe("receivedPct", () => {
  it("is the share of ordered value received", () => {
    expect(receivedPct([line({ orderedQty: 600, receivedQty: 250, unitPrice: 145 })])).toBe(41.7);
    expect(receivedPct([line({ receivedQty: 800 })])).toBe(100);
    expect(receivedPct([line()])).toBe(0);
  });

  it("weights mixed-unit lines by value, not by adding kg to pieces", () => {
    // 4,000 bottles at ₹42 fully received; 4,000 seals at ₹1.8 not received.
    const pct = receivedPct([
      line({ orderedQty: 4000, receivedQty: 4000, unitPrice: 42 }),
      line({ orderedQty: 4000, receivedQty: 0, unitPrice: 1.8 }),
    ]);
    expect(pct).toBe(95.9); // 168,000 / 175,200 — a quantity average would say 50%
  });

  it("does not let an over-receipt push past 100%", () => {
    expect(receivedPct([line({ orderedQty: 100, receivedQty: 150, unitPrice: 10 })])).toBe(100);
  });

  it("is null when there is no value to measure against", () => {
    expect(receivedPct([])).toBeNull();
    expect(receivedPct([line({ unitPrice: 0 })])).toBeNull();
  });
});

describe("overdue", () => {
  it("is a line past its expected date with quantity outstanding", () => {
    expect(isLineOverdue(line({ expectedDeliveryDate: "2026-09-23" }), AS_OF)).toBe(true);
    expect(isLineOverdue(line({ expectedDeliveryDate: "2026-09-24" }), AS_OF)).toBe(false); // due today
    expect(isLineOverdue(line({ expectedDeliveryDate: "2026-04-03", receivedQty: 800 }), AS_OF)).toBe(false);
  });

  it("applies only to open POs", () => {
    const late = [line()];
    for (const s of ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"] as const) expect(isPoOverdue(s, late, AS_OF)).toBe(true);
    for (const s of ["DRAFT", "FULLY_RECEIVED", "CANCELLED"] as const) expect(isPoOverdue(s, late, AS_OF)).toBe(false);
  });

  it("needs only one late line with something outstanding", () => {
    expect(isPoOverdue("PARTIALLY_RECEIVED", [line({ receivedQty: 800 }), line({ expectedDeliveryDate: "2026-10-01" })], AS_OF)).toBe(false);
    expect(isPoOverdue("PARTIALLY_RECEIVED", [line({ receivedQty: 800 }), line()], AS_OF)).toBe(true);
  });
});

describe("deliveredDate", () => {
  it("prefers the recorded delivery date", () => {
    expect(deliveredDate("2026-02-16", ["2026-02-15"])).toEqual({ date: "2026-02-16", source: "ACTUAL" });
  });

  it("falls back to the latest goods receipt, labelled as such", () => {
    expect(deliveredDate(null, ["2026-03-24", "2026-03-10"])).toEqual({ date: "2026-03-24", source: "RECEIPT" });
  });

  it("is null with neither", () => {
    expect(deliveredDate(null, [])).toBeNull();
  });
});

describe("totalMatchesLines", () => {
  it("agrees to the paisa", () => {
    expect(totalMatchesLines(175200, [168000, 7200])).toBe(true);
    expect(totalMatchesLines(175200, [168000, 7199.98])).toBe(false);
  });
});

describe("poCounts", () => {
  it("counts every schema status, plus all and overdue", () => {
    expect(poCounts([
      { status: "ORDERED", overdue: true },
      { status: "ORDERED", overdue: true },
      { status: "FULLY_RECEIVED", overdue: false },
    ])).toEqual({
      all: 3, overdue: 2, DRAFT: 0, APPROVED: 0, ORDERED: 2, PARTIALLY_RECEIVED: 0, FULLY_RECEIVED: 1, CANCELLED: 0,
    });
  });
});
