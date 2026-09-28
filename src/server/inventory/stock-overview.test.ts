import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  buildStockOverview, classifyStock, daysOfCover, DEAD_STOCK_DAYS,
  type OverviewBalance, type OverviewMaterial, type OverviewPolicy,
} from "./stock-overview";

const D = (v: string | number) => new Prisma.Decimal(v);
const DAY = 86_400_000;
const AS_OF = new Date("2026-09-24T00:00:00Z");
const daysAgo = (n: number) => new Date(AS_OF.getTime() - n * DAY);

const PUNE = { id: "loc-pune", code: "PUNE", name: "Pune Plant" };
const MUMBAI = { id: "loc-mum", code: "MUMBAI", name: "Mumbai Warehouse" };

function material(id: string, code: string, cost: string | null = "10"): OverviewMaterial {
  return {
    id, code, name: `Material ${code}`, kind: "RAW",
    standardCost: cost === null ? null : D(cost),
    category: { name: "Chemical" },
    unitOfMeasure: { code: "KG" },
  };
}

function balance(materialId: string, locationId: string, onHand: string, extra: Partial<OverviewBalance> = {}): OverviewBalance {
  return {
    materialId, locationId,
    onHandQty: D(onHand), reservedQty: D(0), quarantineQty: D(0),
    valuation: D(Number(onHand) * 10),
    lastMovementAt: daysAgo(1),
    ...extra,
  };
}

function policy(materialId: string, locationId: string, rop: string, ss: string): OverviewPolicy {
  return { materialId, locationId, reorderPoint: D(rop), safetyStock: D(ss) };
}

describe("classifyStock — the status rule", () => {
  const t = { reorderPoint: D(500), safetyStock: D(100) };

  it("is critical at or below safety stock", () => {
    expect(classifyStock(D(100), t)).toBe("critical");
    expect(classifyStock(D(0), t)).toBe("critical");
  });

  it("is low above safety stock but at or below the reorder point", () => {
    expect(classifyStock(D("100.000001"), t)).toBe("low");
    expect(classifyStock(D(500), t)).toBe("low");
  });

  it("is adequate above the reorder point", () => {
    expect(classifyStock(D("500.5"), t)).toBe("adequate");
  });

  it("is unplanned when there is no policy to compare against", () => {
    expect(classifyStock(D(0), null)).toBe("unplanned");
    expect(classifyStock(D(9999), null)).toBe("unplanned");
  });
});

describe("buildStockOverview — all locations", () => {
  const result = buildStockOverview({
    materials: [material("m1", "RM-1"), material("m2", "RM-2"), material("m3", "FG-1", null)],
    locations: [PUNE, MUMBAI],
    balances: [
      balance("m1", PUNE.id, "4200"),
      balance("m1", MUMBAI.id, "1800"),
      balance("m2", PUNE.id, "180"),
    ],
    policies: [
      policy("m1", PUNE.id, "3000", "500"),
      policy("m2", PUNE.id, "500", "100"),
    ],
    locationId: null,
    asOf: AS_OF,
  });

  it("lists every material, including ones with no stock anywhere", () => {
    expect(result.rows.map((r) => r.code)).toEqual(["RM-1", "RM-2", "FG-1"]);
  });

  it("sums on-hand stock across locations and keeps the per-location split", () => {
    const m1 = result.rows[0];
    expect(m1.onHand).toBe(6000);
    expect(m1.stockByLocation).toEqual({ [PUNE.id]: 4200, [MUMBAI.id]: 1800 });
  });

  it("zero-fills locations where a material has no balance", () => {
    expect(result.rows[1].stockByLocation).toEqual({ [PUNE.id]: 180, [MUMBAI.id]: 0 });
  });

  it("splits value by location, zero-filled, summing to the row value", () => {
    const m1 = result.rows[0];
    expect(m1.valueByLocation).toEqual({ [PUNE.id]: 42000, [MUMBAI.id]: 18000 });
    expect(m1.valueByLocation[PUNE.id] + m1.valueByLocation[MUMBAI.id]).toBe(m1.value);
    expect(result.rows[2].valueByLocation).toEqual({ [PUNE.id]: 0, [MUMBAI.id]: 0 });
  });

  it("returns plain numbers, never Decimal objects or strings", () => {
    const m1 = result.rows[0];
    for (const v of [m1.onHand, m1.reorderPoint, m1.safetyStock, m1.avgCost, m1.value]) {
      expect(typeof v).toBe("number");
    }
    expect(JSON.parse(JSON.stringify(result)).rows[0].onHand).toBe(6000);
  });

  it("classifies each row with the status rule", () => {
    expect(result.rows.map((r) => r.status)).toEqual(["adequate", "low", "unplanned"]);
  });

  it("reports missing thresholds and cost as null rather than zero", () => {
    const fg = result.rows[2];
    expect(fg.reorderPoint).toBeNull();
    expect(fg.safetyStock).toBeNull();
    expect(fg.avgCost).toBeNull();
    expect(fg.onHand).toBe(0);
  });

  it("summarises the rows", () => {
    expect(result.summary).toMatchObject({
      totalSkus: 3,
      totalValue: 61800,
      belowReorderPoint: 1,
      critical: 0,
      deadStockSkus: 0,
      deadStockDays: DEAD_STOCK_DAYS,
    });
  });
});

describe("buildStockOverview — policies across locations", () => {
  const base = {
    materials: [material("m1", "RM-6031")],
    locations: [PUNE, MUMBAI],
    locationId: null,
    asOf: AS_OF,
  };

  it("does not let stock at an unplanned location hide a shortfall at a planned one", () => {
    // Pune 440 is under Pune's reorder point of 500. Mumbai's 200 has no
    // policy and must not lift the combined 640 over it.
    const r = buildStockOverview({
      ...base,
      balances: [balance("m1", PUNE.id, "440"), balance("m1", MUMBAI.id, "200")],
      policies: [policy("m1", PUNE.id, "500", "150")],
    }).rows[0];

    expect(r.onHand).toBe(640);
    expect(r.status).toBe("low");
    expect(r.reorderPoint).toBe(500);
    expect(r.safetyStock).toBe(150);
    expect(r.policyLocationIds).toEqual([PUNE.id]);
  });

  it("reports the most urgent status when several locations are planned", () => {
    const r = buildStockOverview({
      ...base,
      balances: [balance("m1", PUNE.id, "5000"), balance("m1", MUMBAI.id, "10")],
      policies: [policy("m1", PUNE.id, "500", "150"), policy("m1", MUMBAI.id, "100", "20")],
    }).rows[0];

    expect(r.status).toBe("critical");
    expect(r.reorderPoint).toBe(600);
    expect(r.policyLocationIds).toEqual([PUNE.id, MUMBAI.id]);
  });

  it("treats a planned location with no balance row as empty", () => {
    const r = buildStockOverview({
      ...base,
      balances: [balance("m1", MUMBAI.id, "9000")],
      policies: [policy("m1", PUNE.id, "500", "150")],
    }).rows[0];

    expect(r.status).toBe("critical");
  });

  it("invents no thresholds for a material with no policy anywhere", () => {
    const r = buildStockOverview({
      ...base,
      balances: [balance("m1", PUNE.id, "440")],
      policies: [],
    }).rows[0];

    expect(r).toMatchObject({ status: "unplanned", reorderPoint: null, safetyStock: null, policyLocationIds: [] });
  });
});

describe("buildStockOverview — one location", () => {
  const input = {
    materials: [material("m1", "RM-1"), material("m2", "RM-2"), material("m3", "RM-3")],
    locations: [PUNE, MUMBAI],
    balances: [
      balance("m1", PUNE.id, "4200"),
      balance("m1", MUMBAI.id, "1800"),
      balance("m2", PUNE.id, "80"),
    ],
    policies: [
      policy("m1", PUNE.id, "3000", "500"),
      policy("m2", PUNE.id, "500", "100"),
      policy("m3", PUNE.id, "50", "10"),
    ],
    asOf: AS_OF,
  };

  it("uses only that location's stock and thresholds", () => {
    const pune = buildStockOverview({ ...input, locationId: PUNE.id });
    const m1 = pune.rows.find((r) => r.code === "RM-1")!;
    expect(m1.onHand).toBe(4200);
    expect(m1.stockByLocation).toEqual({ [PUNE.id]: 4200 });
    expect(pune.locations).toEqual([PUNE]);
  });

  it("includes planned-but-empty materials, and flags them critical", () => {
    const pune = buildStockOverview({ ...input, locationId: PUNE.id });
    expect(pune.rows.map((r) => r.code)).toEqual(["RM-1", "RM-2", "RM-3"]);
    expect(pune.rows.find((r) => r.code === "RM-3")!.status).toBe("critical");
    expect(pune.summary.critical).toBe(2);
  });

  it("omits materials neither stocked nor planned there", () => {
    const mumbai = buildStockOverview({ ...input, locationId: MUMBAI.id });
    expect(mumbai.rows.map((r) => r.code)).toEqual(["RM-1"]);
  });

  it("marks stock with no policy at that location as unplanned", () => {
    const mumbai = buildStockOverview({ ...input, locationId: MUMBAI.id });
    expect(mumbai.rows[0].status).toBe("unplanned");
    expect(mumbai.summary.belowReorderPoint).toBe(0);
  });
});

describe("buildStockOverview — dead stock", () => {
  function deadOf(balances: OverviewBalance[]) {
    return buildStockOverview({
      materials: balances.map((b) => material(b.materialId, b.materialId)),
      locations: [PUNE],
      balances,
      policies: [],
      locationId: null,
      asOf: AS_OF,
    }).summary;
  }

  it(`counts stock unmoved for more than ${DEAD_STOCK_DAYS} days`, () => {
    const s = deadOf([
      balance("fresh", PUNE.id, "10", { lastMovementAt: daysAgo(DEAD_STOCK_DAYS - 1) }),
      balance("stale", PUNE.id, "20", { lastMovementAt: daysAgo(DEAD_STOCK_DAYS + 1) }),
    ]);
    expect(s.deadStockSkus).toBe(1);
    expect(s.deadStockValue).toBe(200);
  });

  it("counts stock that has never moved", () => {
    expect(deadOf([balance("never", PUNE.id, "5", { lastMovementAt: null })]).deadStockSkus).toBe(1);
  });

  it("flags the dead rows themselves, matching the summary", () => {
    const r = buildStockOverview({
      materials: [material("fresh", "A"), material("stale", "B")],
      locations: [PUNE],
      balances: [
        balance("fresh", PUNE.id, "10", { lastMovementAt: daysAgo(5) }),
        balance("stale", PUNE.id, "10", { lastMovementAt: daysAgo(DEAD_STOCK_DAYS + 5) }),
      ],
      policies: [],
      locationId: null,
      asOf: AS_OF,
    });
    expect(r.rows.map((x) => x.deadStock)).toEqual([false, true]);
    expect(r.rows.filter((x) => x.deadStock).length).toBe(r.summary.deadStockSkus);
  });

  it("never counts a material with nothing on hand", () => {
    expect(deadOf([balance("empty", PUNE.id, "0", { lastMovementAt: daysAgo(400) })]).deadStockSkus).toBe(0);
  });
});

describe("buildStockOverview — decimal arithmetic", () => {
  it("sums without floating-point drift", () => {
    const r = buildStockOverview({
      materials: [material("m1", "RM-1")],
      locations: [PUNE, MUMBAI],
      balances: [
        balance("m1", PUNE.id, "0.1", { valuation: D("0.1") }),
        balance("m1", MUMBAI.id, "0.2", { valuation: D("0.2") }),
      ],
      policies: [],
      locationId: null,
      asOf: AS_OF,
    });
    // 0.1 + 0.2 in floating point is 0.30000000000000004.
    expect(r.rows[0].onHand).toBe(0.3);
    expect(r.summary.totalValue).toBe(0.3);
  });
});

describe("daysOfCover", () => {
  it("divides stock by average daily demand, to one decimal", () => {
    expect(daysOfCover(D(4200), D(280))).toBe(15);
    expect(daysOfCover(D(180), D(42))).toBe(4.3);
  });

  it("is zero when there is demand but no stock", () => {
    expect(daysOfCover(D(0), D(42))).toBe(0);
  });

  it("is null — never guessed — when demand is missing or zero", () => {
    expect(daysOfCover(D(500), null)).toBeNull();
    expect(daysOfCover(D(500), undefined)).toBeNull();
    expect(daysOfCover(D(500), D(0))).toBeNull();
  });

  it("is null for negative demand rather than a negative cover", () => {
    expect(daysOfCover(D(500), D(-5))).toBeNull();
  });

  it("never reports negative cover for a negative balance", () => {
    expect(daysOfCover(D(-10), D(5))).toBe(0);
  });
});

describe("buildStockOverview — days of cover per location", () => {
  const withDemand = (materialId: string, locationId: string, demand: string | null): OverviewPolicy => ({
    ...policy(materialId, locationId, "0", "0"),
    averageDailyDemand: demand === null ? null : D(demand),
  });

  const result = buildStockOverview({
    materials: [material("m1", "RM-1042")],
    locations: [PUNE, MUMBAI],
    balances: [balance("m1", PUNE.id, "4200"), balance("m1", MUMBAI.id, "1800")],
    policies: [withDemand("m1", PUNE.id, "280")],
    locationId: null,
    asOf: AS_OF,
  });

  it("uses each location's own demand", () => {
    expect(result.rows[0].coverDaysByLocation[PUNE.id]).toBe(15);
  });

  it("does not borrow another location's demand for one without a policy", () => {
    expect(result.rows[0].coverDaysByLocation[MUMBAI.id]).toBeNull();
    expect(result.rows[0].stockByLocation[MUMBAI.id]).toBe(1800);
  });

  it("is null where the policy has no demand figure", () => {
    const r = buildStockOverview({
      materials: [material("m1", "RM-1042")],
      locations: [PUNE],
      balances: [balance("m1", PUNE.id, "4200")],
      policies: [withDemand("m1", PUNE.id, null)],
      locationId: null,
      asOf: AS_OF,
    });
    expect(r.rows[0].coverDaysByLocation).toEqual({ [PUNE.id]: null });
  });

  it("has an entry for every location in scope", () => {
    expect(Object.keys(result.rows[0].coverDaysByLocation).sort()).toEqual([MUMBAI.id, PUNE.id].sort());
  });
});

describe("buildStockOverview — replenishment", () => {
  const typed = (materialId: string, locationId: string, procurementType: "BUY" | "MAKE"): OverviewPolicy => ({
    ...policy(materialId, locationId, "10", "5"), procurementType,
  });
  const build = (policies: OverviewPolicy[], locationId: string | null = null) =>
    buildStockOverview({
      materials: [material("m1", "X")], locations: [PUNE, MUMBAI],
      balances: [balance("m1", PUNE.id, "100")], policies, locationId, asOf: AS_OF,
    }).rows[0];

  it("comes from the policies in scope", () => {
    expect(build([typed("m1", PUNE.id, "MAKE")]).replenishment).toBe("MAKE");
    expect(build([typed("m1", PUNE.id, "BUY"), typed("m1", MUMBAI.id, "MAKE")]).replenishment).toBe("MIXED");
    expect(build([typed("m1", PUNE.id, "BUY"), typed("m1", MUMBAI.id, "MAKE")], PUNE.id).replenishment).toBe("BUY");
  });

  it("is null without a policy, or when the policy does not say", () => {
    expect(build([]).replenishment).toBeNull();
    expect(build([policy("m1", PUNE.id, "10", "5")]).replenishment).toBeNull();
  });
});
