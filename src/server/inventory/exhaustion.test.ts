import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildStockOverview, type OverviewMaterial, type OverviewBalance } from "./stock-overview";
import {
  alertLevel, leadTime, chooseVendor, requiredBy, reorderBy, buildExhaustionAlerts,
  type AlertPolicy, type VendorOption,
} from "./exhaustion";

const D = (v: string | number) => new Prisma.Decimal(v);
const AS_OF = new Date("2026-09-24T10:30:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("alertLevel", () => {
  it("uses the page's bands: <3 critical, 3–<7 high, 7–14 medium", () => {
    expect(alertLevel(0)).toBe("critical");
    expect(alertLevel(2.9)).toBe("critical");
    expect(alertLevel(3)).toBe("high");
    expect(alertLevel(6.9)).toBe("high");
    expect(alertLevel(7)).toBe("medium");
    expect(alertLevel(14)).toBe("medium");
    expect(alertLevel(14.1)).toBeNull();
  });
});

describe("leadTime", () => {
  const base = { vendorLeadTimeDays: 10, productionLeadTimeDays: 2, safetyLeadTimeDays: 0 };

  it("takes the vendor's lead time for bought materials", () => {
    expect(leadTime({ ...base, procurementType: "BUY" })).toEqual({ days: 10, source: "VENDOR" });
  });

  it("takes the production lead time for made materials, ignoring any vendor", () => {
    expect(leadTime({ ...base, procurementType: "MAKE" })).toEqual({ days: 2, source: "PRODUCTION" });
  });

  it("adds safety lead time to either", () => {
    expect(leadTime({ ...base, safetyLeadTimeDays: 3, procurementType: "BUY" }).days).toBe(13);
    expect(leadTime({ ...base, safetyLeadTimeDays: 3, procurementType: "MAKE" }).days).toBe(5);
  });

  it("is unknown — not defaulted — for a bought material with no vendor", () => {
    expect(leadTime({ ...base, vendorLeadTimeDays: null, procurementType: "BUY" })).toEqual({ days: null, source: null });
  });
});

describe("chooseVendor", () => {
  const v = (id: string, isPreferred: boolean, leadTimeDays = 5): VendorOption => ({ vendorId: id, name: id, leadTimeDays, isPreferred });

  it("picks the preferred vendor", () => {
    expect(chooseVendor([v("a", false), v("b", true)])?.vendorId).toBe("b");
  });

  it("falls back to the only vendor when none is preferred", () => {
    expect(chooseVendor([v("a", false)])?.vendorId).toBe("a");
  });

  it("refuses to guess between several unpreferred vendors, or several preferred", () => {
    expect(chooseVendor([v("a", false), v("b", false)])).toBeNull();
    expect(chooseVendor([v("a", true), v("b", true)])).toBeNull();
    expect(chooseVendor([])).toBeNull();
  });
});

describe("dates", () => {
  it("runs out after the whole days of cover, from today", () => {
    expect(iso(requiredBy(AS_OF, 4.4))).toBe("2026-09-28");
    expect(iso(requiredBy(AS_OF, 0))).toBe("2026-09-24");
  });

  it("reorders a lead time before stock runs out", () => {
    const r = reorderBy(AS_OF, day("2026-10-05"), 5);
    expect(iso(r.date)).toBe("2026-09-30");
    expect(r.immediate).toBe(false);
  });

  it("is immediate when the reorder day is today or past", () => {
    expect(reorderBy(AS_OF, day("2026-09-28"), 4)).toMatchObject({ immediate: true });
    expect(reorderBy(AS_OF, day("2026-09-28"), 14)).toMatchObject({ immediate: true });
  });

  it("has no reorder date without a lead time", () => {
    expect(reorderBy(AS_OF, day("2026-09-28"), null)).toEqual({ date: null, immediate: false });
  });
});

describe("buildExhaustionAlerts", () => {
  const PUNE = { id: "pune", code: "PUNE", name: "Pune Plant" };
  const MUMBAI = { id: "mum", code: "MUMBAI", name: "Mumbai Warehouse" };

  const material = (id: string): OverviewMaterial => ({
    id, code: id.toUpperCase(), name: `Material ${id}`, kind: "RAW",
    standardCost: D(10), category: null, unitOfMeasure: { code: "KG" },
  });
  const balance = (materialId: string, locationId: string, qty: number): OverviewBalance => ({
    materialId, locationId, onHandQty: D(qty), reservedQty: D(0), quarantineQty: D(0),
    valuation: D(qty * 10), lastMovementAt: AS_OF,
  });
  const policy = (materialId: string, locationId: string, demand: number | null, procurementType: "BUY" | "MAKE" = "BUY", productionLeadTimeDays = 0): AlertPolicy => ({
    materialId, locationId, averageDailyDemand: demand === null ? null : D(demand),
    procurementType, productionLeadTimeDays, safetyLeadTimeDays: 0,
  });

  function run(balances: OverviewBalance[], policies: AlertPolicy[], vendors: [string, VendorOption[]][] = []) {
    const overview = buildStockOverview({
      materials: ["a", "b", "c", "d", "e"].map(material),
      locations: [PUNE, MUMBAI],
      balances,
      policies: policies.map((p) => ({ ...p, reorderPoint: D(0), safetyStock: D(0) })),
      locationId: null,
      asOf: AS_OF,
    });
    return { overview, result: buildExhaustionAlerts({ overview, policies, vendorsByMaterial: new Map(vendors), asOf: AS_OF }) };
  }

  const { overview, result } = run(
    [
      balance("a", PUNE.id, 12),     // 12 / 6 = 2d   → critical, bought
      balance("b", PUNE.id, 440),    // 440 / 100 = 4.4d → high, made
      balance("c", PUNE.id, 5200),   // 5200 / 450 = 11.6d → medium
      balance("d", PUNE.id, 9000),   // 9000 / 100 = 90d → no alert
      balance("a", MUMBAI.id, 10),   // no Mumbai policy → not assessed
    ],
    [
      policy("a", PUNE.id, 6),
      policy("b", PUNE.id, 100, "MAKE", 2),
      policy("c", PUNE.id, 450),
      policy("d", PUNE.id, 100),
      policy("e", PUNE.id, 40),      // no balance: 0 stock, 0d → critical
    ],
    [
      ["a", [{ vendorId: "v-giv", name: "Givaudan India", leadTimeDays: 10, isPreferred: true }]],
      ["c", [{ vendorId: "v-mt", name: "Mold-Tek", leadTimeDays: 5, isPreferred: true }]],
    ],
  );

  it("alerts only within 14 days of cover, least cover first", () => {
    expect(result.alerts.map((a) => [a.code, a.level, a.coverDays])).toEqual([
      ["E", "critical", 0],
      ["A", "critical", 2],
      ["B", "high", 4.4],
      ["C", "medium", 11.6],
    ]);
    expect(result.counts).toEqual({ critical: 2, high: 1, medium: 1, total: 4 });
  });

  it("uses exactly the days of cover Stock Overview / Multi-location show", () => {
    for (const a of result.alerts) {
      const row = overview.rows.find((r) => r.materialId === a.materialId)!;
      expect(a.coverDays).toBe(row.coverDaysByLocation[a.location.id]);
      expect(a.stock).toBe(row.stockByLocation[a.location.id]);
    }
  });

  it("dates a bought alert from the vendor's lead time", () => {
    expect(result.alerts.find((a) => a.code === "A")).toMatchObject({
      dailyUse: 6, requiredBy: "2026-09-26", leadTimeDays: 10, leadTimeSource: "VENDOR",
      reorderImmediate: true, vendor: { id: "v-giv", name: "Givaudan India" }, procurementType: "BUY",
    });
    expect(result.alerts.find((a) => a.code === "C")).toMatchObject({
      requiredBy: "2026-10-05", reorderBy: "2026-09-30", reorderImmediate: false,
    });
  });

  it("dates a made alert from the production lead time, with no vendor", () => {
    expect(result.alerts.find((a) => a.code === "B")).toMatchObject({
      procurementType: "MAKE", leadTimeDays: 2, leadTimeSource: "PRODUCTION",
      requiredBy: "2026-09-28", reorderBy: "2026-09-26", reorderImmediate: false, vendor: null,
    });
  });

  it("leaves lead time and reorder date unknown for a bought material with no vendor", () => {
    expect(result.alerts.find((a) => a.code === "E")).toMatchObject({
      leadTimeDays: null, leadTimeSource: null, reorderBy: null, reorderImmediate: false, vendor: null,
    });
  });

  it("counts stock it cannot assess instead of alerting on it", () => {
    expect(result.notAssessed).toBe(1);
    expect(result.alerts.some((a) => a.location.id === MUMBAI.id)).toBe(false);
  });

  it("does not alert where demand is missing or zero", () => {
    const { result: r } = run(
      [balance("a", PUNE.id, 5), balance("b", PUNE.id, 5)],
      [policy("a", PUNE.id, null), policy("b", PUNE.id, 0)],
    );
    expect(r.alerts).toEqual([]);
    expect(r.notAssessed).toBe(2);
  });

  it("is empty, with zero counts, when there is nothing to assess", () => {
    const { result: r } = run([], []);
    expect(r).toMatchObject({ alerts: [], counts: { critical: 0, high: 0, medium: 0, total: 0 }, notAssessed: 0 });
  });
});
