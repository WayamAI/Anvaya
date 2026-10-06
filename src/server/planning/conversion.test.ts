import { describe, it, expect } from "vitest";
import { draftPurchaseOrders, type PurchasePlanned } from "./conversion";

const TODAY = "2026-04-01";
const po = (id: string, materialCode: string, requiredDate: string, quantity: number, over: Partial<PurchasePlanned> = {}): PurchasePlanned => ({
  id, materialId: `m-${materialCode}`, materialCode, vendorId: "V1", locationId: "PLANT", quantity, requiredDate, ...over,
});
const lines = (d: ReturnType<typeof draftPurchaseOrders>[number]) =>
  d.lines.map((l) => `${l.plannedOrderId}:${l.materialId}:${l.orderedQty}@${l.expectedDeliveryDate}`);

describe("draftPurchaseOrders", () => {
  it("keeps two planned orders for one material on their own dates", () => {
    // 100 needed on the 5th and 100 on the 15th: two lines, never 200 on the 5th.
    const drafts = draftPurchaseOrders([po("p2", "RM", "2026-04-15", 100), po("p1", "RM", "2026-04-05", 100)], TODAY);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ vendorId: "V1", locationId: "PLANT" });
    expect(lines(drafts[0])).toEqual(["p1:m-RM:100@2026-04-05", "p2:m-RM:100@2026-04-15"]);
  });

  it("keeps maximum-quantity splits as separate orders on their date, never merged", () => {
    // Need 250 on the 10th, max order 100 → three planned orders of 100, 100, 50,
    // plus a later need. A PO holds a material once per date, so the second
    // and third splits go on further POs to the same vendor.
    const drafts = draftPurchaseOrders([
      po("s1", "RM", "2026-04-10", 100), po("s2", "RM", "2026-04-10", 100), po("s3", "RM", "2026-04-10", 50),
      po("later", "RM", "2026-04-20", 80),
    ], TODAY);
    expect(drafts.map(lines)).toEqual([
      ["s1:m-RM:100@2026-04-10", "later:m-RM:80@2026-04-20"],
      ["s2:m-RM:100@2026-04-10"],
      ["s3:m-RM:50@2026-04-10"],
    ]);
    expect(drafts.flatMap((d) => d.lines).every((l) => l.orderedQty <= 100)).toBe(true);
  });

  it("moves past dates to today without merging the orders", () => {
    const drafts = draftPurchaseOrders([po("a", "RM", "2026-03-20", 30), po("b", "RM", "2026-03-25", 40)], TODAY);
    expect(drafts.map(lines)).toEqual([["a:m-RM:30@2026-04-01"], ["b:m-RM:40@2026-04-01"]]);
  });

  it("raises one PO per vendor and location, materials side by side", () => {
    const drafts = draftPurchaseOrders([
      po("x", "RM", "2026-04-10", 10), po("y", "PM", "2026-04-10", 20),
      po("z", "RM", "2026-04-10", 30, { vendorId: "V2" }), po("w", "RM", "2026-04-10", 40, { locationId: "DEPOT" }),
    ], TODAY);
    expect(drafts.map((d) => [d.vendorId, d.locationId, lines(d)])).toEqual([
      ["V1", "DEPOT", ["w:m-RM:40@2026-04-10"]],
      ["V1", "PLANT", ["y:m-PM:20@2026-04-10", "x:m-RM:10@2026-04-10"]],
      ["V2", "PLANT", ["z:m-RM:30@2026-04-10"]],
    ]);
  });
});
