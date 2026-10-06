import { describe, it, expect } from "vitest";
import { lowLevelCodes, runMrp, type EngineBom, type EngineInput, type EnginePolicy } from "./mrp-engine";
import { independentDemand } from "./demand";
import { lotSizingConflict, sizeLot } from "./lot-sizing";

/*
 * Every expected number below is worked by hand in the comment beside it.
 * Planning date 2026-04-01, daily buckets unless a test says otherwise.
 */

const ASOF = "2026-04-01";
let n = 0;
const ids = () => `po-${++n}`;

const policy = (materialId: string, over: Partial<EnginePolicy> = {}): EnginePolicy => ({
  materialId, locationId: "PLANT", procurementType: "BUY", safetyStock: 0,
  lotSizing: { rule: "LOT_FOR_LOT", minOrderQty: 0, orderMultiple: 0, maxOrderQty: null },
  periodDays: null, productionLeadTimeDays: 0, safetyLeadTimeDays: 0, ...over,
});

const vendor = (materialId: string, leadTimeDays: number, over = {}) => ({
  materialId,
  options: [{ vendorId: `v-${materialId}`, code: `SUP-${materialId}`, name: "Vendor", leadTimeDays, isPreferred: true, minOrderQty: 0, orderMultiple: 0, ...over }],
});

function input(over: Partial<EngineInput>): EngineInput {
  n = 0;
  return {
    asOf: ASOF, horizonDays: 90, bucketSizeDays: 1, respectSafetyStock: true,
    items: ["RM", "PM", "FG", "SA", "ALT"].map((id) => ({ id, code: id, uom: id === "RM" ? "kg" : "pcs" })),
    policies: [], boms: [], vendors: [], onHand: [], demand: [], receipts: [],
    manufacturingLocationIds: ["PLANT"], newId: ids, ...over,
  };
}

const so = (materialId: string, date: string, qty: number, ref = "SO-1") =>
  ({ materialId, locationId: "PLANT", date, qty, sourceType: "SALES_ORDER" as const, sourceId: `${ref}-line`, reference: ref });

describe("netting, lot sizing and lead time", () => {
  it("nets demand against stock above safety stock and open receipts, then sizes and offsets the order", () => {
    // Stock 30, safety 10 → 20 free. PO +15 on the 5th → 35. Demand 40 on the
    // 10th → 5 short. Min 50 → order 50, needed 04-10, 5-day lead → release 04-05.
    const out = runMrp(input({
      policies: [policy("RM", { safetyStock: 10, lotSizing: { rule: "MIN_ORDER_QTY", minOrderQty: 50, orderMultiple: 25, maxOrderQty: null } })],
      vendors: [vendor("RM", 5)],
      onHand: [{ materialId: "RM", locationId: "PLANT", qty: 30 }],
      demand: [so("RM", "2026-04-10", 40)],
      receipts: [{ materialId: "RM", locationId: "PLANT", date: "2026-04-05", qty: 15, type: "PURCHASE_ORDER", id: "pol-1", reference: "PO-1" }],
    }));

    expect(out.plannedOrders).toHaveLength(1);
    expect(out.plannedOrders[0]).toMatchObject({
      type: "PURCHASE", quantity: 50, requiredDate: "2026-04-10", releaseDate: "2026-04-05",
      leadTimeDays: 5, leadTimeSource: "VENDOR:SUP-RM", suggestedVendorId: "v-RM",
    });
    // Only the shortfall is pegged; the rest of the lot is surplus.
    expect(out.plannedOrders[0].pegs).toEqual([
      { demandSourceType: "SALES_ORDER", demandSourceId: "SO-1-line", demandReference: "SO-1", quantity: 5, requiredDate: "2026-04-10", parentPlannedOrderId: null },
    ]);
    const rows = out.requirements.filter((r) => r.materialId === "RM");
    expect(rows.map((r) => [r.bucketStart, r.grossRequirement, r.scheduledReceipts, r.netRequirement, r.plannedReceipt, r.plannedRelease, r.projectedOnHand])).toEqual([
      ["2026-04-01", 0, 0, 0, 0, 0, 30],
      ["2026-04-05", 0, 15, 0, 0, 50, 45],
      ["2026-04-10", 40, 0, 5, 50, 0, 55],
    ]);
    expect(out.exceptions).toEqual([]);
    expect(out.plannedOrders[0].explanation.summary).toBe("Buy 50 kg RM, release 2026-04-05, for 2026-04-10 — covers SO-1");
  });

  it("replenishes safety stock with no demand at all, pegged to safety stock, and flags the release as past due", () => {
    // Stock 5 under safety 10 → need 5 now; 3-day lead → release 03-29.
    const out = runMrp(input({
      policies: [policy("RM", { safetyStock: 10 })],
      vendors: [vendor("RM", 3)],
      onHand: [{ materialId: "RM", locationId: "PLANT", qty: 5 }],
    }));
    expect(out.plannedOrders[0]).toMatchObject({ quantity: 5, requiredDate: ASOF, releaseDate: "2026-03-29" });
    expect(out.plannedOrders[0].pegs[0]).toMatchObject({ demandSourceType: "SAFETY_STOCK", quantity: 5 });
    expect(out.exceptions).toEqual([expect.objectContaining({ type: "PAST_DUE_RELEASE", severity: "CRITICAL", daysLate: 3, referenceId: "po-1" })]);
  });

  it("can ignore safety stock for a run", () => {
    const out = runMrp(input({
      respectSafetyStock: false,
      policies: [policy("RM", { safetyStock: 10 })], vendors: [vendor("RM", 3)],
      onHand: [{ materialId: "RM", locationId: "PLANT", qty: 5 }],
    }));
    expect(out.plannedOrders).toEqual([]);
  });

  it("carries a lot's surplus forward so a later demand is covered without a new order", () => {
    // Demand 10 on the 5th and 10 on the 9th; min 50 → one order of 50.
    const out = runMrp(input({
      policies: [policy("RM", { lotSizing: { rule: "MIN_ORDER_QTY", minOrderQty: 50, orderMultiple: 0, maxOrderQty: null } })],
      vendors: [vendor("RM", 2)],
      demand: [so("RM", "2026-04-05", 10, "SO-A"), so("RM", "2026-04-09", 10, "SO-B")],
    }));
    expect(out.plannedOrders.map((p) => p.quantity)).toEqual([50]);
  });

  it("orders a whole period's demand at once under period order quantity", () => {
    // 7-day period from the 3rd: 10 (3rd) + 20 (6th) together; the 12th is outside → its own order.
    const out = runMrp(input({
      policies: [policy("RM", { lotSizing: { rule: "PERIOD_ORDER_QTY", minOrderQty: 0, orderMultiple: 0, maxOrderQty: null }, periodDays: 7 })],
      vendors: [vendor("RM", 1)],
      demand: [so("RM", "2026-04-03", 10), so("RM", "2026-04-06", 20), so("RM", "2026-04-12", 5)],
    }));
    expect(out.plannedOrders.map((p) => [p.requiredDate, p.quantity])).toEqual([["2026-04-03", 30], ["2026-04-12", 5]]);
  });

  it("buckets weekly when asked, keeping day-precise required dates", () => {
    const out = runMrp(input({
      bucketSizeDays: 7,
      policies: [policy("RM")], vendors: [vendor("RM", 0)],
      demand: [so("RM", "2026-04-03", 10), so("RM", "2026-04-06", 5)],
    }));
    const rows = out.requirements.filter((r) => r.grossRequirement > 0);
    expect(rows).toEqual([expect.objectContaining({ bucketStart: "2026-04-01", bucketEnd: "2026-04-07", grossRequirement: 15, netRequirement: 15 })]);
    expect(out.plannedOrders[0]).toMatchObject({ quantity: 15, requiredDate: "2026-04-03" });
  });

  it("uses the stricter of policy and vendor minimums", () => {
    const out = runMrp(input({
      policies: [policy("RM", { lotSizing: { rule: "MIN_ORDER_QTY", minOrderQty: 10, orderMultiple: 0, maxOrderQty: null } })],
      vendors: [vendor("RM", 1, { minOrderQty: 40, orderMultiple: 20 })],
      demand: [so("RM", "2026-04-05", 5)],
    }));
    expect(out.plannedOrders[0].quantity).toBe(40);
  });
});

describe("multi-level explosion and pegging", () => {
  const bom: EngineBom = {
    materialId: "FG", versionId: "bv", baseQuantity: 100,
    components: [
      { materialId: "SA", quantity: 20, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true },
      { materialId: "PM", quantity: 100, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true },
      { materialId: "ALT", quantity: 5, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: true, unitMatches: true },
    ],
  };
  const saBom: EngineBom = {
    materialId: "SA", versionId: "sv", baseQuantity: 10,
    components: [{ materialId: "RM", quantity: 5, scrapFactor: 0.02, leadTimeOffsetDays: 1, isOptional: false, unitMatches: true }],
  };

  it("assigns low-level codes by deepest use", () => {
    // RM appears under SA (level 2) and directly under FG (level 1) → 2.
    const direct: EngineBom = { ...bom, components: [...bom.components, { ...saBom.components[0], materialId: "RM" }] };
    expect(Object.fromEntries(lowLevelCodes([direct, saBom]).codes)).toEqual({ FG: 0, SA: 1, PM: 1, ALT: 1, RM: 2 });
  });

  it("explodes planned production through every level, offsetting each by its lead time", () => {
    // FG 200 on the 20th, make in 2 days → release 04-18.
    //   SA: 20/100 × 200 = 40 needed 04-18; make in 1 day → release 04-17.
    //     RM: 5/10 × 40 × 1.02 = 20.4, needed a day before SA's release (offset 1) → 04-16; buy in 4 → 04-12.
    //   PM: 100/100 × 200 = 200 needed 04-18; stock 50 → buy 150, 3 days → 04-15.
    //   ALT is optional: not planned.
    const out = runMrp(input({
      policies: [
        policy("FG", { procurementType: "MAKE", productionLeadTimeDays: 2 }),
        policy("SA", { procurementType: "MAKE", productionLeadTimeDays: 1 }),
        policy("RM"), policy("PM"),
      ],
      boms: [bom, saBom],
      vendors: [vendor("RM", 4), vendor("PM", 3)],
      onHand: [{ materialId: "PM", locationId: "PLANT", qty: 50 }],
      demand: [so("FG", "2026-04-20", 200, "SO-9")],
    }));

    const by = Object.fromEntries(out.plannedOrders.map((p) => [p.materialId, p]));
    expect(Object.keys(by).sort()).toEqual(["FG", "PM", "RM", "SA"]);
    expect(by.FG).toMatchObject({ type: "PRODUCTION", quantity: 200, releaseDate: "2026-04-18", lowLevelCode: 0 });
    expect(by.SA).toMatchObject({ type: "PRODUCTION", quantity: 40, requiredDate: "2026-04-18", releaseDate: "2026-04-17", lowLevelCode: 1 });
    expect(by.RM).toMatchObject({ type: "PURCHASE", quantity: 20.4, requiredDate: "2026-04-16", releaseDate: "2026-04-12", lowLevelCode: 2 });
    expect(by.PM).toMatchObject({ quantity: 150, requiredDate: "2026-04-18", releaseDate: "2026-04-15" });

    // Pegging chains down: RM → SA's planned order → FG's → SO-9.
    expect(by.FG.pegs[0]).toMatchObject({ demandSourceType: "SALES_ORDER", demandReference: "SO-9", quantity: 200 });
    expect(by.SA.pegs[0]).toMatchObject({ demandSourceType: "DEPENDENT", parentPlannedOrderId: by.FG.id, quantity: 40 });
    expect(by.RM.pegs[0]).toMatchObject({ demandSourceType: "DEPENDENT", parentPlannedOrderId: by.SA.id, quantity: 20.4 });
    expect(out.materialsPlanned).toBe(4);
  });

  it("counts open work orders' unissued components as demand", () => {
    const out = runMrp(input({
      policies: [policy("RM")], vendors: [vendor("RM", 1)],
      demand: [{ materialId: "RM", locationId: "PLANT", date: "2026-04-04", qty: 12, sourceType: "WORK_ORDER", sourceId: "woc-1", reference: "WO-7" }],
    }));
    expect(out.plannedOrders[0].pegs[0]).toMatchObject({ demandSourceType: "WORK_ORDER", demandReference: "WO-7", quantity: 12 });
  });
});

describe("exceptions", () => {
  it("reports a stock-out inside the lead time, a receipt that arrives after it, and the order released too late", () => {
    // Stock 10, demand 30 on the 3rd → −20 from 04-03. PO 50 on the 8th: 5 days late.
    // Lead time 5 → nothing new can arrive before 04-06: shortage 20, critical.
    const out = runMrp(input({
      policies: [policy("RM")], vendors: [vendor("RM", 5)],
      onHand: [{ materialId: "RM", locationId: "PLANT", qty: 10 }],
      demand: [so("RM", "2026-04-03", 30)],
      receipts: [{ materialId: "RM", locationId: "PLANT", date: "2026-04-08", qty: 50, type: "PURCHASE_ORDER", id: "pol-9", reference: "PO-9" }],
    }));
    const types = out.exceptions.map((e) => [e.type, e.severity, e.quantity ?? null, e.daysLate ?? null]);
    expect(types).toEqual(expect.arrayContaining([
      ["PAST_DUE_RELEASE", "HIGH", 20, 3],
      ["LATE_SUPPLY", "MEDIUM", 50, 5],
      ["MATERIAL_SHORTAGE", "CRITICAL", 20, null],
    ]));
    expect(out.exceptions).toHaveLength(3);
  });

  it("treats an overdue receipt as arriving now and reports it", () => {
    const out = runMrp(input({
      policies: [policy("RM")], vendors: [vendor("RM", 5)],
      demand: [so("RM", "2026-04-02", 10)],
      receipts: [{ materialId: "RM", locationId: "PLANT", date: "2026-03-25", qty: 10, type: "PURCHASE_ORDER", id: "pol-1", reference: "PO-OLD" }],
    }));
    expect(out.plannedOrders).toEqual([]);
    expect(out.exceptions).toEqual([expect.objectContaining({ type: "LATE_SUPPLY", severity: "HIGH", daysLate: 7, referenceId: "pol-1" })]);
  });

  it("names missing vendors, missing BOMs and locations that cannot make", () => {
    const out = runMrp(input({
      policies: [
        policy("RM"),
        policy("FG", { procurementType: "MAKE" }),
        { ...policy("SA", { procurementType: "MAKE" }), locationId: "DEPOT" },
      ],
      vendors: [{ materialId: "RM", options: [
        { vendorId: "a", code: "A", name: "A", leadTimeDays: 3, isPreferred: false, minOrderQty: 0, orderMultiple: 0 },
        { vendorId: "b", code: "B", name: "B", leadTimeDays: 9, isPreferred: false, minOrderQty: 0, orderMultiple: 0 },
      ] }],
      demand: [so("RM", "2026-04-10", 5), so("FG", "2026-04-10", 5), { ...so("SA", "2026-04-10", 5), locationId: "DEPOT" }],
    }));
    expect(out.exceptions.map((e) => [e.type, e.materialId]).sort()).toEqual([
      ["MATERIAL_SHORTAGE", "SA"], ["MISSING_BOM", "FG"], ["MISSING_VENDOR", "RM"],
    ].sort());
    // Buy and make still planned (with what is known); nothing planned at the depot.
    expect(out.plannedOrders.map((p) => p.materialId).sort()).toEqual(["FG", "RM"]);
  });

  it("reports BOM cycles without exploding forever", () => {
    const loop: EngineBom[] = [
      { materialId: "FG", versionId: "a", baseQuantity: 1, components: [{ materialId: "SA", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true }] },
      { materialId: "SA", versionId: "b", baseQuantity: 1, components: [{ materialId: "FG", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true }] },
    ];
    const out = runMrp(input({
      boms: loop, policies: [policy("FG", { procurementType: "MAKE" })], demand: [so("FG", "2026-04-10", 1)],
    }));
    expect(out.exceptions.filter((e) => e.type === "BOM_CYCLE").map((e) => e.materialId).sort()).toEqual(["FG", "SA"]);
    expect(out.plannedOrders).toHaveLength(1);
  });

  it("flags stock above safety stock with no demand in the horizon", () => {
    const out = runMrp(input({
      policies: [policy("PM", { safetyStock: 10 })],
      onHand: [{ materialId: "PM", locationId: "PLANT", qty: 100 }],
    }));
    expect(out.exceptions).toEqual([expect.objectContaining({ type: "EXCESS_STOCK", severity: "LOW", quantity: 90 })]);
  });

  it("ignores demand and supply beyond the horizon", () => {
    const out = runMrp(input({
      horizonDays: 30,
      policies: [policy("RM")], vendors: [vendor("RM", 1)],
      demand: [so("RM", "2026-06-01", 99)],
    }));
    expect(out.plannedOrders).toEqual([]);
  });
});

describe("forecast consumption", () => {
  const period = { id: "fp-apr", forecastName: "FG plan", materialId: "FG", locationId: "PLANT", periodStart: "2026-04-01", periodEnd: "2026-04-30", forecastQty: 300 };

  it("counts orders against the forecast, not on top of it", () => {
    // April forecast 300, orders 120 in April → 180 more expected, plus the 120 ordered.
    const { events, forecastUse } = independentDemand(
      [{ id: "l1", reference: "SO-1", materialId: "FG", locationId: "PLANT", requiredDate: "2026-04-10", openQty: 120, bookedQty: 120 }],
      [period], "2026-04-01", "2026-06-30", true,
    );
    expect(forecastUse).toEqual([{ periodId: "fp-apr", forecastQty: 300, consumedBySales: 120, netForecast: 180 }]);
    const total = events.reduce((s, e) => s + e.qty, 0);
    expect(total).toBeCloseTo(300, 6);
    // Spread over the month's five weeks rather than lumped on the 1st.
    expect(events.filter((e) => e.sourceType === "FORECAST").map((e) => e.date)).toEqual(["2026-04-01", "2026-04-08", "2026-04-15", "2026-04-22", "2026-04-29"]);
  });

  it("counts only the part of a period still ahead, and nothing when orders exceed it", () => {
    // From the 16th, 15 of 30 days remain → half of 300.
    expect(independentDemand([], [period], "2026-04-16", "2026-06-30", true).forecastUse[0].netForecast).toBe(150);
    const over = independentDemand(
      [{ id: "l1", reference: "SO-1", materialId: "FG", locationId: "PLANT", requiredDate: "2026-04-10", openQty: 400, bookedQty: 400 }],
      [period], "2026-04-01", "2026-06-30", true,
    );
    expect(over.forecastUse[0].netForecast).toBe(0);
    expect(over.events.map((e) => e.sourceType)).toEqual(["SALES_ORDER"]);
  });

  it("counts orders already shipped against the forecast, not only open ones", () => {
    // April forecast 1000. 600 booked for April has already shipped (nothing
    // open), 200 is open: 1000 − 800 = 200 more expected, plus the 200 open.
    const { events, forecastUse } = independentDemand(
      [
        { id: "l1", reference: "SO-1", materialId: "FG", locationId: "PLANT", requiredDate: "2026-04-05", openQty: 0, bookedQty: 600 },
        { id: "l2", reference: "SO-2", materialId: "FG", locationId: "PLANT", requiredDate: "2026-04-20", openQty: 200, bookedQty: 200 },
      ],
      [{ ...period, forecastQty: 1000 }], "2026-04-01", "2026-06-30", true,
    );
    expect(forecastUse[0]).toMatchObject({ consumedBySales: 800, netForecast: 200 });
    // The shipped line is history, not demand.
    expect(events.filter((e) => e.sourceType === "SALES_ORDER").map((e) => e.sourceId)).toEqual(["l2"]);
    expect(events.reduce((s, e) => s + e.qty, 0)).toBeCloseTo(400, 6);
  });

  it("does not let an overdue order consume the forecast still ahead", () => {
    // From the 16th, 15 of 30 days remain → 150 of 300 still ahead. The open
    // order due the 10th belongs to the half already past: it is overdue
    // demand of its own and leaves the 150 untouched (270 in all).
    const { events, forecastUse } = independentDemand(
      [{ id: "l1", reference: "SO-1", materialId: "FG", locationId: "PLANT", requiredDate: "2026-04-10", openQty: 120, bookedQty: 120 }],
      [period], "2026-04-16", "2026-06-30", true,
    );
    expect(forecastUse[0]).toMatchObject({ consumedBySales: 0, netForecast: 150 });
    expect(events.reduce((s, e) => s + e.qty, 0)).toBeCloseTo(270, 6);
  });

  it("can plan from orders alone", () => {
    expect(independentDemand([], [period], "2026-04-01", "2026-06-30", false).events).toEqual([]);
  });
});

describe("sizeLot", () => {
  const s = (rule: "LOT_FOR_LOT" | "FIXED_ORDER_QTY" | "MIN_ORDER_QTY" | "PERIOD_ORDER_QTY", min = 0, mult = 0, max: number | null = null) =>
    ({ rule, minOrderQty: min, orderMultiple: mult, maxOrderQty: max });

  it("applies each rule, the multiple and the maximum", () => {
    expect(sizeLot(37, s("LOT_FOR_LOT"))).toEqual([37]);
    expect(sizeLot(37, s("LOT_FOR_LOT", 0, 25))).toEqual([50]);
    expect(sizeLot(37, s("FIXED_ORDER_QTY", 20))).toEqual([40]);
    expect(sizeLot(37, s("MIN_ORDER_QTY", 100, 50))).toEqual([100]);
    expect(sizeLot(137, s("MIN_ORDER_QTY", 100, 50))).toEqual([150]);
    expect(sizeLot(0.3, s("LOT_FOR_LOT", 0, 0.1))).toEqual([0.3]);
    expect(sizeLot(250, s("LOT_FOR_LOT", 0, 30, 100))).toEqual([90, 90, 90]);
    expect(sizeLot(0, s("MIN_ORDER_QTY", 100))).toEqual([]);
  });

  it("never inflates the total when the maximum is below the order multiple", () => {
    // Need 1000, multiple 100, max 10: no order can be both ≤ 10 and a whole
    // 100. The multiple is what the vendor can ship, so it wins: ten orders of
    // 100, still 1000 in all — not a hundred orders of 100 (10,000).
    const orders = sizeLot(1000, s("LOT_FOR_LOT", 0, 100, 10));
    expect(orders).toEqual(Array(10).fill(100));
    expect(orders.reduce((a, b) => a + b, 0)).toBe(1000);
    // Need 250 → rounded to 300 by the multiple, three orders of 100.
    expect(sizeLot(250, s("LOT_FOR_LOT", 0, 100, 10))).toEqual([100, 100, 100]);
  });

  it("names a maximum that no whole multiple fits under", () => {
    expect(lotSizingConflict(s("LOT_FOR_LOT", 0, 100, 10))).toMatch(/maximum order quantity 10 is below the order multiple 100/);
    expect(lotSizingConflict(s("LOT_FOR_LOT", 0, 30, 100))).toBeNull();
    expect(lotSizingConflict(s("LOT_FOR_LOT", 0, 100, null))).toBeNull();
    expect(lotSizingConflict(s("LOT_FOR_LOT", 0, 0, 10))).toBeNull();
  });
});

describe("exceptions are reported once per condition", () => {
  const fingerprint = (e: { type: string; materialId: string | null; locationId: string | null; referenceId: string | null; message: string }) =>
    [e.type, e.materialId, e.locationId, e.referenceId, e.message].join("|");

  it("names a BOM line in the wrong unit once, however many orders explode it", () => {
    // FG is split into three orders by its maximum; each explodes the BOM,
    // and the PM line is quoted in a unit with no conversion.
    const out = runMrp(input({
      policies: [policy("FG", { procurementType: "MAKE", lotSizing: { rule: "LOT_FOR_LOT", minOrderQty: 0, orderMultiple: 0, maxOrderQty: 100 } }), policy("RM")],
      boms: [{ materialId: "FG", versionId: "v", baseQuantity: 1, components: [
        { materialId: "RM", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true },
        { materialId: "PM", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: false },
      ] }],
      vendors: [vendor("RM", 2)],
      demand: [so("FG", "2026-04-20", 250)],
    }));
    expect(out.plannedOrders.filter((p) => p.materialId === "FG")).toHaveLength(3);
    expect(out.exceptions.filter((e) => e.type === "MISSING_BOM" && /PM/.test(e.message))).toHaveLength(1);
  });

  it("never holds two identical exceptions in one run", () => {
    const out = runMrp(input({
      policies: [policy("FG", { procurementType: "MAKE", lotSizing: { rule: "LOT_FOR_LOT", minOrderQty: 0, orderMultiple: 0, maxOrderQty: 100 } }), policy("RM", { safetyStock: 50 })],
      boms: [{ materialId: "FG", versionId: "v", baseQuantity: 1, components: [
        { materialId: "RM", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: true },
        { materialId: "PM", quantity: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false, unitMatches: false },
      ] }],
      demand: [so("FG", "2026-04-03", 250), so("FG", "2026-04-04", 120, "SO-2")],
      receipts: [{ materialId: "RM", locationId: "PLANT", date: "2026-03-20", qty: 10, type: "PURCHASE_ORDER", id: "late-line", reference: "PO-9" }],
    }));
    const prints = out.exceptions.map(fingerprint);
    expect(prints.length).toBeGreaterThanOrEqual(3); // several kinds: wrong unit, late supply, past-due releases
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe("rescheduling open supply in", () => {
  const poReceipt = (date: string, qty: number, ref: string) =>
    ({ materialId: "RM", locationId: "PLANT", date, qty, type: "PURCHASE_ORDER" as const, id: `${ref}-line`, reference: ref });
  const plan = (over: Partial<EngineInput>) => runMrp(input({
    policies: [policy("RM")], vendors: [vendor("RM", 5)], rescheduleInToleranceDays: 3, ...over,
  }));
  const ofType = (out: ReturnType<typeof runMrp>, type: string) => out.exceptions.filter((e) => e.type === type);

  it("expedites a PO arriving within the tolerance instead of ordering again", () => {
    // 100 needed on the 20th; PO-1 brings 100 on the 22nd, 2 days late.
    const out = plan({ demand: [so("RM", "2026-04-20", 100)], receipts: [poReceipt("2026-04-22", 100, "PO-1")] });
    expect(out.plannedOrders).toEqual([]);
    expect(ofType(out, "RESCHEDULE_IN")).toEqual([expect.objectContaining({
      materialId: "RM", locationId: "PLANT", severity: "HIGH", quantity: 100,
      dueDate: "2026-04-20", daysLate: 2, referenceType: "PURCHASE_ORDER", referenceId: "PO-1-line",
      message: expect.stringMatching(/PO-1.*2026-04-22.*2026-04-20/),
    })]);
    // Reported once: not again as late supply.
    expect(ofType(out, "LATE_SUPPLY")).toEqual([]);
    // Not pretended on time: the record keeps the receipt on its own date, so
    // stock shows short until it is expedited.
    const rows = out.requirements.filter((r) => r.materialId === "RM");
    expect(rows.find((r) => r.bucketStart === "2026-04-20")).toMatchObject({ grossRequirement: 100, scheduledReceipts: 0, projectedOnHand: -100, plannedReceipt: 0 });
    expect(rows.find((r) => r.bucketStart === "2026-04-22")).toMatchObject({ scheduledReceipts: 100, projectedOnHand: 0 });
  });

  it("orders anew when the PO arrives later than the tolerance", () => {
    // 4 days late with a 3-day tolerance: genuine new supply, PO-1 left alone.
    const out = plan({ demand: [so("RM", "2026-04-20", 100)], receipts: [poReceipt("2026-04-24", 100, "PO-1")] });
    expect(out.plannedOrders.map((p) => `${p.quantity}@${p.requiredDate}`)).toEqual(["100@2026-04-20"]);
    expect(ofType(out, "RESCHEDULE_IN")).toEqual([]);
    expect(ofType(out, "LATE_SUPPLY")).toHaveLength(1);
  });

  it("counts the tolerance in whole days, inclusive", () => {
    const onEdge = plan({ demand: [so("RM", "2026-04-20", 100)], receipts: [poReceipt("2026-04-23", 100, "PO-1")] });
    expect(onEdge.plannedOrders).toEqual([]);
  });

  it("never lets two requirements use the same receipt", () => {
    // 60 on the 20th pulls PO-1 (100 on the 22nd) in; its other 40 covers part
    // of the 60 on the 21st, and 20 is ordered. PO-1 must not count again on
    // the 22nd, so the 100 on the 30th is ordered in full. 220 needed, 100 on
    // order, 120 planned.
    const out = plan({
      demand: [so("RM", "2026-04-20", 60), so("RM", "2026-04-21", 60, "SO-2"), so("RM", "2026-04-30", 100, "SO-3")],
      receipts: [poReceipt("2026-04-22", 100, "PO-1")],
    });
    expect(out.plannedOrders.map((p) => `${p.quantity}@${p.requiredDate}`)).toEqual(["20@2026-04-21", "100@2026-04-30"]);
    expect(ofType(out, "RESCHEDULE_IN")).toHaveLength(1);
  });

  it("pulls several receipts in date order, then orders only what is still short", () => {
    // 130 on the 20th: PO-B (50, 21st) first, then PO-A (50, 22nd); PO-C on
    // the 25th is outside the tolerance, so the last 30 is ordered.
    const out = plan({
      demand: [so("RM", "2026-04-20", 130)],
      receipts: [poReceipt("2026-04-22", 50, "PO-A"), poReceipt("2026-04-21", 50, "PO-B"), poReceipt("2026-04-25", 50, "PO-C")],
    });
    expect(ofType(out, "RESCHEDULE_IN").map((e) => e.referenceId)).toEqual(["PO-B-line", "PO-A-line"]);
    expect(out.plannedOrders.map((p) => `${p.quantity}@${p.requiredDate}`)).toEqual(["30@2026-04-20"]);
  });

  it("keeps lot sizing for what is still short", () => {
    // 130 short, 50 pulled in, 80 left → minimum order 100, multiple 25.
    const out = plan({
      policies: [policy("RM", { lotSizing: { rule: "MIN_ORDER_QTY", minOrderQty: 100, orderMultiple: 25, maxOrderQty: null } })],
      demand: [so("RM", "2026-04-20", 130)], receipts: [poReceipt("2026-04-21", 50, "PO-B")],
    });
    expect(out.plannedOrders.map((p) => p.quantity)).toEqual([100]);
  });

  it("is off with a tolerance of zero, as before", () => {
    const out = plan({ rescheduleInToleranceDays: 0, demand: [so("RM", "2026-04-20", 100)], receipts: [poReceipt("2026-04-22", 100, "PO-1")] });
    expect(out.plannedOrders.map((p) => p.quantity)).toEqual([100]);
    expect(ofType(out, "RESCHEDULE_IN")).toEqual([]);
  });
});

describe("lot sizing conflicts in a run", () => {
  it("plans the true quantity and reports a maximum below the vendor's multiple once", () => {
    // The policy caps orders at 10; the vendor only ships in 100s.
    const out = runMrp(input({
      policies: [policy("RM", { lotSizing: { rule: "LOT_FOR_LOT", minOrderQty: 0, orderMultiple: 0, maxOrderQty: 10 } })],
      vendors: [vendor("RM", 5, { orderMultiple: 100 })],
      demand: [so("RM", "2026-04-20", 1000), so("RM", "2026-05-20", 50, "SO-2")],
    }));
    expect(out.plannedOrders.reduce((s, p) => s + p.quantity, 0)).toBe(1100);
    const conflicts = out.exceptions.filter((e) => e.type === "POLICY_CONFLICT");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ materialId: "RM", locationId: "PLANT", severity: "HIGH" });
  });
});
