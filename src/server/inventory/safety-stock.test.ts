import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildStockOverview, type OverviewMaterial, type OverviewBalance } from "./stock-overview";
import { buildExhaustionAlerts, type VendorOption } from "./exhaustion";
import {
  zForServiceLevel, recommendedSafetyStock, variability, buildSafetyStock, type SafetyStockPolicy,
} from "./safety-stock";

const D = (v: string | number) => new Prisma.Decimal(v);
const AS_OF = new Date("2026-09-24T00:00:00Z");

describe("zForServiceLevel", () => {
  it("matches standard normal tables", () => {
    expect(zForServiceLevel(0.5)).toBeCloseTo(0, 6);
    expect(zForServiceLevel(0.95)).toBeCloseTo(1.6449, 4);
    expect(zForServiceLevel(0.97)).toBeCloseTo(1.8808, 4);
    expect(zForServiceLevel(0.975)).toBeCloseTo(1.96, 3);
    expect(zForServiceLevel(0.98)).toBeCloseTo(2.0537, 4);
    expect(zForServiceLevel(0.999)).toBeCloseTo(3.0902, 4);
    expect(zForServiceLevel(0.01)).toBeCloseTo(-2.3263, 4);
  });

  it("is null outside (0, 1)", () => {
    for (const p of [0, 1, -0.1, 1.2, Number.NaN]) expect(zForServiceLevel(p), String(p)).toBeNull();
  });
});

describe("recommendedSafetyStock", () => {
  it("is Z × σ × √lead time, rounded up to a whole unit", () => {
    // 1.6449 × 18 × √14 = 110.78 → 111
    expect(recommendedSafetyStock({ demandStdDev: 18, serviceLevel: 0.95, leadTimeDays: 14 }).value).toBe(111);
    // 2.0537 × 2 × √10 = 12.99 → 13
    expect(recommendedSafetyStock({ demandStdDev: 2, serviceLevel: 0.98, leadTimeDays: 10 }).value).toBe(13);
  });

  it("is zero with no lead time to cover, or no spread", () => {
    expect(recommendedSafetyStock({ demandStdDev: 18, serviceLevel: 0.95, leadTimeDays: 0 }).value).toBe(0);
    expect(recommendedSafetyStock({ demandStdDev: 0, serviceLevel: 0.95, leadTimeDays: 5 }).value).toBe(0);
  });

  it("never recommends a negative buffer, even below a 50% service level", () => {
    expect(recommendedSafetyStock({ demandStdDev: 10, serviceLevel: 0.3, leadTimeDays: 4 }).value).toBe(0);
  });

  it("does not round an exact whole number up a unit", () => {
    // Z(0.5) is 0, so any spread and lead time gives exactly 0.
    expect(recommendedSafetyStock({ demandStdDev: 5, serviceLevel: 0.5, leadTimeDays: 4 }).value).toBe(0);
  });

  it("is unavailable, with the reason, when an input is missing — never defaulted", () => {
    expect(recommendedSafetyStock({ demandStdDev: null, serviceLevel: 0.95, leadTimeDays: 5 })).toEqual({ value: null, z: null, reason: "NO_STD_DEV" });
    expect(recommendedSafetyStock({ demandStdDev: 5, serviceLevel: null, leadTimeDays: 5 })).toEqual({ value: null, z: null, reason: "NO_SERVICE_LEVEL" });
    expect(recommendedSafetyStock({ demandStdDev: 5, serviceLevel: 1, leadTimeDays: 5 }).reason).toBe("NO_SERVICE_LEVEL");
    expect(recommendedSafetyStock({ demandStdDev: 5, serviceLevel: 0.95, leadTimeDays: null })).toMatchObject({ value: null, reason: "NO_LEAD_TIME" });
  });
});

describe("variability", () => {
  it("bands the coefficient of variation", () => {
    expect(variability(310, 28)).toBe("Low");     // 0.09
    expect(variability(100, 15)).toBe("Medium");  // exactly 0.15
    expect(variability(280, 45)).toBe("Medium");  // 0.16
    expect(variability(100, 30)).toBe("High");    // exactly 0.30
    expect(variability(42, 18)).toBe("High");     // 0.43
  });

  it("is null without a positive mean or a spread", () => {
    expect(variability(0, 5)).toBeNull();
    expect(variability(null, 5)).toBeNull();
    expect(variability(10, null)).toBeNull();
  });
});

describe("buildSafetyStock", () => {
  const PUNE = { id: "pune", code: "PUNE", name: "Pune Plant" };
  const MUMBAI = { id: "mum", code: "MUMBAI", name: "Mumbai Warehouse" };

  const material = (id: string): OverviewMaterial => ({
    id, code: id.toUpperCase(), name: `Material ${id}`, kind: "RAW",
    standardCost: D(10), category: { name: "Chemical" }, unitOfMeasure: { code: "KG" },
  });
  const balance = (materialId: string, locationId: string, qty: number): OverviewBalance => ({
    materialId, locationId, onHandQty: D(qty), reservedQty: D(0), quarantineQty: D(0), valuation: D(qty * 10), lastMovementAt: AS_OF,
  });
  const policy = (materialId: string, over: Partial<SafetyStockPolicy> = {}): SafetyStockPolicy => ({
    materialId, locationId: PUNE.id, procurementType: "BUY",
    averageDailyDemand: D(42), demandStdDev: D(18), serviceLevel: D("0.95"), safetyStock: D(100),
    productionLeadTimeDays: 0, safetyLeadTimeDays: 0, ...over,
  });
  const vendors = new Map<string, VendorOption[]>([
    ["a", [{ vendorId: "v1", name: "Rashtriya Chemicals", leadTimeDays: 14, isPreferred: true }]],
    ["d", [{ vendorId: "v2", name: "X", leadTimeDays: 5, isPreferred: false }, { vendorId: "v3", name: "Y", leadTimeDays: 7, isPreferred: false }]],
  ]);

  const policies = [
    policy("a"),                                                                   // bought, 14d vendor
    policy("b", { procurementType: "MAKE", productionLeadTimeDays: 2, safetyStock: D(150), demandStdDev: D(25), serviceLevel: D("0.97"), averageDailyDemand: D(100) }),
    policy("c", { demandStdDev: null }),                                            // no spread
    policy("d"),                                                                   // two vendors, none preferred
    policy("e", { safetyStock: D(0) }),                                             // zero buffer, no vendor
  ];
  const overview = buildStockOverview({
    materials: ["a", "b", "c", "d", "e"].map(material),
    locations: [PUNE, MUMBAI],
    balances: [balance("a", PUNE.id, 180), balance("b", PUNE.id, 150), balance("c", MUMBAI.id, 10)],
    policies: policies.map((p) => ({ ...p, reorderPoint: D(0) })),
    locationId: null,
    asOf: AS_OF,
  });
  const view = buildSafetyStock({ overview, policies, vendorsByMaterial: vendors });
  const row = (code: string) => view.rows.find((r) => r.code === code)!;

  it("recommends from the vendor lead time for a bought material", () => {
    expect(row("A")).toMatchObject({
      leadTimeDays: 14, leadTimeSource: "VENDOR", vendor: { name: "Rashtriya Chemicals" },
      z: 1.645, current: 100, recommended: 111, gap: -11, variability: "High", unavailableReason: null,
    });
  });

  it("recommends from the production lead time for a made material", () => {
    // 1.8808 × 25 × √2 = 66.5 → 67
    expect(row("B")).toMatchObject({ procurementType: "MAKE", leadTimeDays: 2, leadTimeSource: "PRODUCTION", vendor: null, recommended: 67, gap: 83 });
  });

  it("does not calculate without a spread, or without a single vendor", () => {
    expect(row("C")).toMatchObject({ recommended: null, gap: null, unavailableReason: "NO_STD_DEV" });
    expect(row("D")).toMatchObject({ recommended: null, gap: null, leadTimeDays: null, unavailableReason: "NO_LEAD_TIME" });
  });

  it("flags stock at or below safety stock, as Stock Overview's critical rule does", () => {
    expect(row("A").belowSafetyStock).toBe(false);   // 180 > 100
    expect(row("B").belowSafetyStock).toBe(true);    // 150 <= 150
    expect(row("E").belowSafetyStock).toBe(true);    // 0 <= 0
  });

  it("summarises buffers, including stock held with no policy", () => {
    expect(view.summary).toEqual({
      withSafetyStock: 4,
      belowSafetyStock: 4,       // B, C, D, E hold 0 or less than their buffer
      noBuffer: 2,               // E has a zero buffer; C's Mumbai stock has no policy
      underRecommended: 1,       // A
      unavailable: 3,            // C, D, E
    });
  });

  it("lists the most under-buffered first and uncalculated last", () => {
    expect(view.rows.map((r) => r.code)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("uses the same lead time as the exhaustion alerts", () => {
    const alerts = buildExhaustionAlerts({ overview, policies, vendorsByMaterial: vendors, asOf: AS_OF });
    for (const a of alerts.alerts) {
      const r = view.rows.find((x) => x.materialId === a.materialId && x.location.id === a.location.id)!;
      expect(r.leadTimeDays).toBe(a.leadTimeDays);
      expect(r.leadTimeSource).toBe(a.leadTimeSource);
      expect(r.vendor).toEqual(a.vendor);
    }
    expect(alerts.alerts.length).toBeGreaterThan(0);
  });
});
