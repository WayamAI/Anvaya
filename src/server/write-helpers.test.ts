import { describe, it, expect } from "vitest";
import { formatDocumentNumber, parseSuffix, seriesFor } from "@/server/db/sequence";
import { hashBody } from "@/server/api/idempotency";
import { addDays, todayIn } from "@/server/config/business-date";
import { createGoodsReceiptBody, createPurchaseOrderBody, lotQcBody } from "@/server/validation/purchasing";
import { duplicateLineProblems } from "@/server/purchasing/po-rules";

/** Small pure helpers behind the write side: numbering, idempotency hashing, business dates, validation. */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

describe("document numbers", () => {
  it("formats and parses the seeded conventions", () => {
    expect(seriesFor("PURCHASE_ORDER", 2026)).toBe("PO-2026");
    expect(seriesFor("SALES_ORDER", 2026)).toBe("SO");
    expect(formatDocumentNumber("GRN-2026", 389)).toBe("GRN-2026-0389");
    expect(formatDocumentNumber("PO-2026", 12345)).toBe("PO-2026-12345");
    expect(parseSuffix("RMB-2026", "RMB-2026-0482")).toBe(482);
    expect(parseSuffix("RMB-2026", "RMB-2026-04a2")).toBeNull();
    expect(parseSuffix("PO-2026", "PO-2025-0001")).toBeNull();
  });
});

describe("hashBody", () => {
  it("ignores key order but not values", () => {
    expect(hashBody({ a: 1, b: [{ x: 1, y: 2 }] })).toBe(hashBody({ b: [{ y: 2, x: 1 }], a: 1 }));
    expect(hashBody({ a: 1 })).not.toBe(hashBody({ a: 2 }));
    expect(hashBody({ a: [1, 2] })).not.toBe(hashBody({ a: [2, 1] }));
  });
});

describe("business dates", () => {
  it("uses the company's zone, not UTC", () => {
    // 20:00 UTC on 31 Mar is already 1 Apr in India.
    const t = new Date("2026-03-31T20:00:00Z");
    expect(todayIn("Asia/Kolkata", t)).toBe("2026-04-01");
    expect(todayIn("UTC", t)).toBe("2026-03-31");
  });

  it("adds calendar days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("validation", () => {
  const po = { vendorId: "v", locationId: "l", expectedDeliveryDate: "2026-10-10", lines: [{ materialId: "m", orderedQty: 5 }] };

  it("accepts a minimal PO and rejects unknown fields", () => {
    expect(createPurchaseOrderBody.safeParse(po).success).toBe(true);
    expect(createPurchaseOrderBody.safeParse({ ...po, status: "APPROVED" }).success).toBe(false);
  });

  it("rejects bad quantities and dates; duplicate materials are judged by the service", () => {
    const issues = (b: unknown) => (createPurchaseOrderBody.safeParse(b) as { error?: { issues: { path: (string | number)[] }[] } })
      .error?.issues.map((i) => i.path.join("."));
    expect(issues({ ...po, lines: [{ materialId: "m", orderedQty: 0 }] })).toEqual(["lines.0.orderedQty"]);
    expect(issues({ ...po, lines: [{ materialId: "m", orderedQty: 1.1234567 }] })).toEqual(["lines.0.orderedQty"]);
    expect(issues({ ...po, expectedDeliveryDate: "2026-02-30" })).toEqual(["expectedDeliveryDate"]);
    // One material twice on the same date is still refused — by the service,
    // which knows each line's effective date (it may default to the header).
    const twice = { ...po, lines: [{ materialId: "m", orderedQty: 1 }, { materialId: "m", orderedQty: 2 }] };
    expect(issues(twice)).toBeUndefined();
    expect(duplicateLineProblems(twice.lines, po.expectedDeliveryDate).map((p) => p.path)).toEqual(["lines.1.materialId"]);
  });

  it("allows 6-decimal quantities", () => {
    expect(createPurchaseOrderBody.safeParse({ ...po, lines: [{ materialId: "m", orderedQty: 0.000001 }] }).success).toBe(true);
  });

  it("requires a reason to hold or reject a lot", () => {
    expect(lotQcBody.safeParse({ status: "APPROVED" }).success).toBe(true);
    expect(lotQcBody.safeParse({ status: "REJECTED" }).success).toBe(false);
    expect(lotQcBody.safeParse({ status: "REJECTED", reason: "Failed assay" }).success).toBe(true);
  });

  it("refuses REJECTED as a receipt inspection status — use rejectedQty", () => {
    const grn = { purchaseOrderId: "p", lines: [{ purchaseOrderLineId: "x", receivedQty: 1, inspectionStatus: "REJECTED" }] };
    expect(createGoodsReceiptBody.safeParse(grn).success).toBe(false);
  });
});
