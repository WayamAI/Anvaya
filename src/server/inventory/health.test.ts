import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildStockOverview, type OverviewMaterial, type OverviewBalance, type OverviewPolicy } from "./stock-overview";
import {
  buildInventoryHealth, materialScore, materialIssue, shortestCover, recommendations, HEALTH_TARGET,
  type MaterialHealth,
} from "./health";

/*
  Health is built from a real buildStockOverview result rather than a
  hand-made fixture, so these tests also prove the two pages agree.
*/

const D = (v: string | number) => new Prisma.Decimal(v);
const AS_OF = new Date("2026-09-24T00:00:00Z");
const daysAgo = (n: number) => new Date(AS_OF.getTime() - n * 86_400_000);

const PUNE = { id: "pune", code: "PUNE", name: "Pune Plant" };
const MUMBAI = { id: "mum", code: "MUMBAI", name: "Mumbai Warehouse" };

const material = (id: string, category: string | null, cost = 10): OverviewMaterial => ({
  id, code: id.toUpperCase(), name: `Material ${id}`, kind: "RAW",
  standardCost: D(cost), category: category ? { name: category } : null, unitOfMeasure: { code: "KG" },
});
const balance = (materialId: string, locationId: string, qty: number, movedDaysAgo = 1, cost = 10): OverviewBalance => ({
  materialId, locationId, onHandQty: D(qty), reservedQty: D(0), quarantineQty: D(0),
  valuation: D(qty * cost), lastMovementAt: daysAgo(movedDaysAgo),
});
const policy = (materialId: string, locationId: string, rop: number, ss: number, demand: number | null = null): OverviewPolicy => ({
  materialId, locationId, reorderPoint: D(rop), safetyStock: D(ss), averageDailyDemand: demand === null ? null : D(demand),
});

function overview(input: { materials: OverviewMaterial[]; balances: OverviewBalance[]; policies: OverviewPolicy[] }) {
  return buildStockOverview({ ...input, locations: [PUNE, MUMBAI], locationId: null, asOf: AS_OF });
}

describe("materialScore", () => {
  it("averages availability and movement", () => {
    expect(materialScore({ status: "adequate", onHand: 10, deadStock: false })).toBe(100);
    expect(materialScore({ status: "low", onHand: 10, deadStock: false })).toBe(75);
    expect(materialScore({ status: "adequate", onHand: 10, deadStock: true })).toBe(50);
    expect(materialScore({ status: "critical", onHand: 10, deadStock: true })).toBe(0);
  });

  it("leaves out the parts that do not apply", () => {
    // No stock: movement cannot be judged.
    expect(materialScore({ status: "critical", onHand: 0, deadStock: false })).toBe(0);
    // No policy: availability cannot be judged.
    expect(materialScore({ status: "unplanned", onHand: 10, deadStock: false })).toBe(100);
    expect(materialScore({ status: "unplanned", onHand: 0, deadStock: false })).toBeNull();
  });
});

describe("materialIssue", () => {
  it("reports the most urgent issue first", () => {
    expect(materialIssue({ status: "critical", deadStock: true })).toBe("critical");
    expect(materialIssue({ status: "low", deadStock: true })).toBe("low");
    expect(materialIssue({ status: "adequate", deadStock: true })).toBe("dead");
    expect(materialIssue({ status: "unplanned", deadStock: false })).toBe("unplanned");
    expect(materialIssue({ status: "adequate", deadStock: false })).toBeNull();
  });
});

describe("shortestCover", () => {
  it("takes the least cover among locations that have a figure", () => {
    expect(shortestCover({ a: 15, b: null, c: 4.3 })).toBe(4.3);
  });

  it("is null — never zero — when no location has a demand figure", () => {
    expect(shortestCover({ a: null, b: null })).toBeNull();
    expect(shortestCover({})).toBeNull();
  });
});

describe("recommendations", () => {
  const m = (code: string, issue: MaterialHealth["issue"], coverDays: number | null, value: number): MaterialHealth => ({
    materialId: code, code, name: code, category: null, uom: "KG", onHand: 1, value, status: "adequate",
    deadStock: false, idleDays: null, coverDays, replenishment: "BUY", score: 0, issue,
  });

  it("orders critical, low, dead, unplanned; least cover first within shortages", () => {
    const out = recommendations([
      m("dead-big", "dead", null, 900), m("low-10d", "low", 10, 1), m("crit", "critical", 8, 1),
      m("low-2d", "low", 2, 1), m("low-unknown", "low", null, 999), m("plan", "unplanned", null, 5), m("ok", null, 30, 1),
    ], 10);
    expect(out.map((x) => x.code)).toEqual(["crit", "low-2d", "low-10d", "low-unknown", "dead-big", "plan"]);
  });

  it("orders dead stock by value at stake and caps the list", () => {
    const out = recommendations([m("a", "dead", null, 10), m("b", "dead", null, 30), m("c", "dead", null, 20)], 2);
    expect(out.map((x) => x.code)).toEqual(["b", "c"]);
  });
});

describe("buildInventoryHealth", () => {
  const data = overview({
    materials: [material("a", "Chemical"), material("b", "Chemical"), material("c", "Polymer"), material("d", null)],
    balances: [
      balance("a", PUNE.id, 1000),               // adequate, moving
      balance("b", PUNE.id, 50, 200),            // low, dead
      balance("c", PUNE.id, 300), balance("c", MUMBAI.id, 200, 120), // adequate
      balance("d", MUMBAI.id, 40, 150),          // unplanned, dead
    ],
    policies: [
      policy("a", PUNE.id, 500, 100, 50),
      policy("b", PUNE.id, 100, 20, 10),
      policy("c", PUNE.id, 200, 50),
    ],
  });
  const h = buildInventoryHealth(data, { outboundMovements12m: 3 });

  it("scores availability as planned materials above reorder point", () => {
    expect(h.components.availability).toEqual({ score: 67, adequate: 2, planned: 3 });
  });

  it("scores excess & obsolescence as the share of value still moving", () => {
    // b (500) and d (400) are dead; total 15,900.
    expect(h.components.excess).toMatchObject({ deadValue: 900, totalValue: 15900, deadStockDays: 90 });
    expect(h.components.excess.score).toBe(94);
  });

  it("never scores turnover, and bases the overall score only on what it has", () => {
    expect(h.components.turnover).toEqual({ score: null, outboundMovements12m: 3 });
    expect(h.overall).toEqual({ score: 81, basedOn: ["availability", "excess"] });
    expect(h.target).toBe(HEALTH_TARGET);
  });

  it("uses exactly the Stock Overview totals", () => {
    expect(h.totals).toMatchObject({
      value: data.summary.totalValue,
      skus: data.summary.totalSkus,
      belowReorderPoint: data.summary.belowReorderPoint,
      deadStockSkus: data.summary.deadStockSkus,
      deadStockValue: data.summary.deadStockValue,
      stockedSkus: 4,
    });
  });

  it("breaks value down by location, adding back up to the total", () => {
    expect(h.byLocation).toEqual([
      { key: "pune", label: "Pune Plant", value: 13500, share: 84.9, skus: 3 },
      { key: "mum", label: "Mumbai Warehouse", value: 2400, share: 15.1, skus: 2 },
    ]);
    expect(h.byLocation.reduce((s, l) => s + l.value, 0)).toBe(h.totals.value);
  });

  it("breaks value down by category, largest first, with uncategorised kept", () => {
    expect(h.byCategory.map((c) => [c.label, c.value, c.skus, c.belowReorderPoint])).toEqual([
      ["Chemical", 10500, 2, 1],
      ["Polymer", 5000, 1, 0],
      ["Uncategorised", 400, 1, 0],
    ]);
    expect(h.byCategory.reduce((s, c) => s + c.value, 0)).toBe(h.totals.value);
  });

  it("carries days of cover and idle days per material", () => {
    const b = h.materials.find((m) => m.code === "B")!;
    expect(b).toMatchObject({ status: "low", issue: "low", coverDays: 5, idleDays: 200, deadStock: true, score: 25 });
    // C has a policy but no demand figure: no cover, not zero.
    expect(h.materials.find((m) => m.code === "C")!.coverDays).toBeNull();
  });

  it("lists materials worst score first, while recommendations rank by issue", () => {
    // D scores 0 (unplanned, so only its dead stock counts); B scores 25.
    expect(h.materials.map((m) => m.code)).toEqual(["D", "B", "A", "C"]);
    // A shortage is acted on before dead stock, whatever the scores.
    expect(h.recommendations.map((m) => m.code)).toEqual(["B", "D"]);
  });

  it("has no trend, because no history is stored", () => {
    expect(h.trend).toBeNull();
  });
});

describe("buildInventoryHealth — missing data", () => {
  it("returns nulls, not zeros, when there is nothing to measure", () => {
    const h = buildInventoryHealth(overview({ materials: [], balances: [], policies: [] }), { outboundMovements12m: 0 });
    expect(h.overall).toEqual({ score: null, basedOn: [] });
    expect(h.components.availability.score).toBeNull();
    expect(h.components.excess.score).toBeNull();
    expect(h.byLocation.every((l) => l.value === 0 && l.share === null)).toBe(true);
    expect(h.byCategory).toEqual([]);
    expect(h.recommendations).toEqual([]);
  });

  it("does not score availability when no material has a policy", () => {
    const h = buildInventoryHealth(
      overview({ materials: [material("a", "X")], balances: [balance("a", PUNE.id, 10)], policies: [] }),
      { outboundMovements12m: 0 },
    );
    expect(h.components.availability).toEqual({ score: null, adequate: 0, planned: 0 });
    expect(h.overall).toEqual({ score: 100, basedOn: ["excess"] });
  });
});
