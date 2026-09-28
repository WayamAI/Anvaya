import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the materials, master-data and stock-overview
 * endpoints: authentication, permission, tenant scoping and response shape,
 * run through the real withApi() wrapper. The database and session lookup are
 * mocked, so these run without Postgres.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  material: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  materialCategory: { findMany: vi.fn() },
  unitOfMeasure: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  materialLocationPolicy: { findMany: vi.fn() },
  stockMovement: { count: vi.fn() },
  vendorMaterial: { findMany: vi.fn() },
}));

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listMaterials } from "./materials/route";
import { GET as getMaterial } from "./materials/[id]/route";
import { GET as stockOverview } from "./inventory/stock-overview/route";
import { GET as listLocations } from "./locations/route";
import { GET as listCategories } from "./material-categories/route";
import { GET as listUnits } from "./units/route";
import { GET as inventoryHealth } from "./inventory/health/route";
import { GET as exhaustionAlerts } from "./inventory/exhaustion-alerts/route";
import { GET as safetyStock } from "./inventory/safety-stock/route";

const D = (v: string) => new Prisma.Decimal(v);
const COMPANY = "company-1";

function actor(permissions: string[]) {
  return {
    userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
    sessionId: "session-1", roles: ["PLANNER"], permissions: new Set(permissions),
  };
}

const READER = ["material:read", "inventory:read", "location:read"];

function request(path: string, signedIn = true) {
  return new NextRequest(`http://localhost:8080/api/v1${path}`, {
    headers: signedIn ? { cookie: "anvaya.session=token" } : {},
  });
}

const materialRow = {
  id: "m1", companyId: COMPANY, code: "RM-1042", name: "Polypropylene Granules",
  description: null, kind: "RAW", categoryId: "cat1", unitOfMeasureId: "u1",
  standardCost: D("82.0000"), shelfLifeDays: null, isBatchTracked: true, isActive: true,
  createdAt: new Date("2026-09-23T00:00:00Z"), updatedAt: new Date("2026-09-23T00:00:00Z"),
  category: { id: "cat1", code: "POLYMER", name: "Polymer" },
  unitOfMeasure: { id: "u1", code: "KG", name: "Kilogram" },
};

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(READER));
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /materials", () => listMaterials(request("/materials", false)), "material:read"],
    ["GET /inventory/stock-overview", () => stockOverview(request("/inventory/stock-overview", false)), "inventory:read"],
    ["GET /locations", () => listLocations(request("/locations", false)), "location:read"],
    ["GET /material-categories", () => listCategories(request("/material-categories", false)), "material:read"],
    ["GET /units", () => listUnits(request("/units", false)), "material:read"],
    ["GET /inventory/health", () => inventoryHealth(request("/inventory/health", false)), "inventory:read"],
    ["GET /inventory/exhaustion-alerts", () => exhaustionAlerts(request("/inventory/exhaustion-alerts", false)), "inventory:read"],
    ["GET /inventory/safety-stock", () => safetyStock(request("/inventory/safety-stock", false)), "inventory:read"],
  ] as const;

  it.each(endpoints)("%s returns 401 without a session", async (_name, call) => {
    session.resolveSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it.each(endpoints)("%s returns 403 without %s", async (_name, call, permission) => {
    session.resolveSession.mockResolvedValue(actor(READER.filter((p) => p !== permission)));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });

  it("GET /materials/:id requires material:read", async () => {
    session.resolveSession.mockResolvedValue(actor(["inventory:read"]));
    const res = await getMaterial(request("/materials/m1"), { params: { id: "m1" } });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/materials", () => {
  it("returns the envelope with numbers, not Decimal strings", async () => {
    db.material.findMany.mockResolvedValue([materialRow]);
    db.material.count.mockResolvedValue(1);

    const res = await listMaterials(request("/materials"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.data[0]).toMatchObject({
      code: "RM-1042",
      standardCost: 82,
      category: { name: "Polymer" },
      unit: { code: "KG" },
    });
    expect(body.meta).toEqual({ nextCursor: null, limit: 50, total: 1 });
  });

  it("scopes to the caller's company and applies filters", async () => {
    db.material.findMany.mockResolvedValue([]);
    db.material.count.mockResolvedValue(0);

    await listMaterials(request("/materials?q=resin&kind=RAW&active=all"));

    const where = db.material.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(COMPANY);
    expect(where.kind).toBe("RAW");
    expect(where).not.toHaveProperty("isActive");
    expect(where.OR).toHaveLength(2);
  });

  it("pages with a cursor when there are more rows than the limit", async () => {
    db.material.findMany.mockResolvedValue([
      materialRow,
      { ...materialRow, id: "m2", code: "RM-2087" },
    ]);
    db.material.count.mockResolvedValue(5);

    const body = await (await listMaterials(request("/materials?limit=1"))).json();

    expect(db.material.findMany.mock.calls[0][0].take).toBe(2);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ nextCursor: "m1", limit: 1, total: 5 });
  });

  it("returns 422 for invalid query parameters", async () => {
    const res = await listMaterials(request("/materials?kind=GADGET"));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");
    expect(db.material.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/materials/:id", () => {
  it("returns policies and balances with decimals converted", async () => {
    db.material.findFirst.mockResolvedValue({
      ...materialRow,
      policies: [{
        id: "p1", location: { id: "l1", code: "PUNE", name: "Pune Plant" },
        procurementType: "BUY", safetyStock: D("500.000000"), reorderPoint: D("3000.000000"),
        lotSizingRule: "MIN_ORDER_QTY", minOrderQty: D("500"), maxOrderQty: null,
        orderMultiple: D("100"), periodDays: null, productionLeadTimeDays: 0, safetyLeadTimeDays: 0,
        averageDailyDemand: D("280"), demandStdDev: D("45"), serviceLevel: D("0.9500"),
        abcClass: "A", isActive: true,
      }],
      balances: [{
        location: { id: "l1", code: "PUNE", name: "Pune Plant" },
        onHandQty: D("4200.000000"), reservedQty: D("0"), quarantineQty: D("0"),
        valuation: D("344400.0000"), lastMovementAt: new Date("2026-03-25T00:00:00Z"),
      }],
    });

    const res = await getMaterial(request("/materials/m1"), { params: { id: "m1" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(db.material.findFirst.mock.calls[0][0].where).toEqual({ id: "m1", companyId: COMPANY });
    expect(body.data.policies[0]).toMatchObject({ safetyStock: 500, reorderPoint: 3000, maxOrderQty: null, serviceLevel: 0.95 });
    expect(body.data.balances[0]).toMatchObject({ onHandQty: 4200, valuation: 344400, lastMovementAt: "2026-03-25T00:00:00.000Z" });
  });

  it("returns 404 for a missing or other-company material", async () => {
    db.material.findFirst.mockResolvedValue(null);
    const res = await getMaterial(request("/materials/elsewhere"), { params: { id: "elsewhere" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/v1/inventory/stock-overview", () => {
  const locations = [
    { id: "l-pune", code: "PUNE", name: "Pune Plant" },
    { id: "l-mum", code: "MUMBAI", name: "Mumbai Warehouse" },
  ];

  beforeEach(() => {
    db.location.findMany.mockResolvedValue(locations);
    db.material.findMany.mockResolvedValue([
      { id: "m1", code: "RM-2087", name: "Stearic Acid", kind: "RAW", standardCost: D("145.0000"), category: { name: "Chemical" }, unitOfMeasure: { code: "KG" } },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", onHandQty: D("180.000000"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("26100.0000"), lastMovementAt: new Date() },
    ]);
    db.materialLocationPolicy.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", reorderPoint: D("500.000000"), safetyStock: D("100.000000"), averageDailyDemand: D("42.000000") },
    ]);
  });

  it("returns rows, locations and summary", async () => {
    const res = await stockOverview(request("/inventory/stock-overview"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.locations).toEqual(locations);
    expect(body.data.rows[0]).toMatchObject({
      code: "RM-2087", onHand: 180, reorderPoint: 500, safetyStock: 100,
      avgCost: 145, value: 26100, status: "low",
      stockByLocation: { "l-pune": 180, "l-mum": 0 },
      // 180 / 42 per day; Mumbai has no policy, so no cover figure.
      coverDaysByLocation: { "l-pune": 4.3, "l-mum": null },
    });
    expect(db.materialLocationPolicy.findMany.mock.calls[0][0].select.averageDailyDemand).toBe(true);
    expect(body.data.summary).toMatchObject({ totalSkus: 1, totalValue: 26100, belowReorderPoint: 1, critical: 0 });
  });

  it("scopes every query to the caller's company", async () => {
    await stockOverview(request("/inventory/stock-overview"));
    expect(db.location.findMany.mock.calls[0][0].where.companyId).toBe(COMPANY);
    expect(db.material.findMany.mock.calls[0][0].where.companyId).toBe(COMPANY);
    expect(db.inventoryBalance.findMany.mock.calls[0][0].where.material).toEqual({ companyId: COMPANY });
    expect(db.materialLocationPolicy.findMany.mock.calls[0][0].where.material).toEqual({ companyId: COMPANY });
  });

  it("filters to one location", async () => {
    const body = await (await stockOverview(request("/inventory/stock-overview?locationId=l-mum"))).json();
    expect(body.data.locationId).toBe("l-mum");
    expect(body.data.locations).toEqual([locations[1]]);
    expect(body.data.rows).toEqual([]);
  });

  it("returns 404 for a location outside the company", async () => {
    const res = await stockOverview(request("/inventory/stock-overview?locationId=elsewhere"));
    expect(res.status).toBe(404);
    expect(db.material.findMany).not.toHaveBeenCalled();
  });
});

describe("master-data lists", () => {
  it("GET /locations returns active locations for the company", async () => {
    db.location.findMany.mockResolvedValue([{ id: "l1", code: "PUNE" }]);
    const body = await (await listLocations(request("/locations"))).json();
    expect(body.data).toEqual([{ id: "l1", code: "PUNE" }]);
    expect(db.location.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY, isActive: true });
  });

  it("GET /material-categories is company-scoped", async () => {
    db.materialCategory.findMany.mockResolvedValue([]);
    expect((await listCategories(request("/material-categories"))).status).toBe(200);
    expect(db.materialCategory.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
  });

  it("GET /units is company-scoped", async () => {
    db.unitOfMeasure.findMany.mockResolvedValue([{ id: "u1", code: "KG", name: "Kilogram", dimension: "MASS" }]);
    const body = await (await listUnits(request("/units"))).json();
    expect(body.data[0].code).toBe("KG");
    expect(db.unitOfMeasure.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
  });
});

describe("GET /api/v1/inventory/health", () => {
  beforeEach(() => {
    db.location.findMany.mockResolvedValue([
      { id: "l-pune", code: "PUNE", name: "Pune Plant" },
      { id: "l-mum", code: "MUMBAI", name: "Mumbai Warehouse" },
    ]);
    db.material.findMany.mockResolvedValue([
      { id: "m1", code: "RM-2087", name: "Stearic Acid", kind: "RAW", standardCost: D("145.0000"), category: { name: "Chemical" }, unitOfMeasure: { code: "KG" } },
      { id: "m2", code: "RM-1042", name: "Polypropylene Granules", kind: "RAW", standardCost: D("82.0000"), category: { name: "Polymer" }, unitOfMeasure: { code: "KG" } },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", onHandQty: D("180"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("26100"), lastMovementAt: new Date() },
      { materialId: "m2", locationId: "l-pune", onHandQty: D("4200"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("344400"), lastMovementAt: new Date() },
      { materialId: "m2", locationId: "l-mum", onHandQty: D("1800"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("147600"), lastMovementAt: new Date() },
    ]);
    db.materialLocationPolicy.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", reorderPoint: D("500"), safetyStock: D("100"), averageDailyDemand: D("42") },
      { materialId: "m2", locationId: "l-pune", reorderPoint: D("3000"), safetyStock: D("500"), averageDailyDemand: D("280") },
    ]);
    db.stockMovement.count.mockResolvedValue(1);
  });

  it("returns scores, breakdowns and totals built on the stock overview", async () => {
    const res = await inventoryHealth(request("/inventory/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.components.availability).toEqual({ score: 50, adequate: 1, planned: 2 });
    expect(body.data.components.turnover).toEqual({ score: null, outboundMovements12m: 1 });
    expect(body.data.components.excess.score).toBe(100);
    expect(body.data.overall).toEqual({ score: 75, basedOn: ["availability", "excess"] });
    expect(body.data.totals).toMatchObject({ value: 518100, skus: 2, belowReorderPoint: 1 });
    expect(body.data.byLocation.map((l: { label: string; value: number }) => [l.label, l.value]))
      .toEqual([["Pune Plant", 370500], ["Mumbai Warehouse", 147600]]);
    expect(body.data.materials[0]).toMatchObject({ code: "RM-2087", issue: "low", coverDays: 4.3 });
    expect(body.data.trend).toBeNull();
  });

  it("scopes the stock and movement queries to the caller's company", async () => {
    await inventoryHealth(request("/inventory/health"));
    expect(db.material.findMany.mock.calls[0][0].where.companyId).toBe(COMPANY);
    expect(db.inventoryBalance.findMany.mock.calls[0][0].where.material).toEqual({ companyId: COMPANY });
    const countWhere = db.stockMovement.count.mock.calls[0][0].where;
    expect(countWhere.material).toEqual({ companyId: COMPANY });
    expect(countWhere.quantity).toEqual({ lt: 0 });
  });
});

describe("GET /api/v1/inventory/exhaustion-alerts", () => {
  beforeEach(() => {
    db.location.findMany.mockResolvedValue([
      { id: "l-pune", code: "PUNE", name: "Pune Plant" },
      { id: "l-mum", code: "MUMBAI", name: "Mumbai Warehouse" },
    ]);
    db.material.findMany.mockResolvedValue([
      { id: "m1", code: "RM-8012", name: "Fragrance Blend FG-04", kind: "RAW", standardCost: D("2800"), category: { name: "Fragrance" }, unitOfMeasure: { code: "L" } },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", onHandQty: D("12"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("33600"), lastMovementAt: new Date() },
      { materialId: "m1", locationId: "l-mum", onHandQty: D("10"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("28000"), lastMovementAt: new Date() },
    ]);
    // Serves both the stock overview's policy query and the alerts' own.
    db.materialLocationPolicy.findMany.mockResolvedValue([{
      materialId: "m1", locationId: "l-pune", reorderPoint: D("40"), safetyStock: D("10"),
      averageDailyDemand: D("6"), procurementType: "BUY", productionLeadTimeDays: 0, safetyLeadTimeDays: 0,
    }]);
    db.vendorMaterial.findMany.mockResolvedValue([
      { materialId: "m1", isPreferred: true, leadTimeDays: 10, vendor: { id: "v8", name: "Givaudan India" } },
    ]);
  });

  it("returns alerts with levels, dates, lead time and vendor", async () => {
    const res = await exhaustionAlerts(request("/inventory/exhaustion-alerts"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.counts).toEqual({ critical: 1, high: 0, medium: 0, total: 1 });
    expect(body.data.notAssessed).toBe(1);
    expect(body.data.alerts[0]).toMatchObject({
      code: "RM-8012", level: "critical", stock: 12, dailyUse: 6, coverDays: 2,
      location: { id: "l-pune", name: "Pune Plant" }, procurementType: "BUY",
      leadTimeDays: 10, leadTimeSource: "VENDOR", reorderImmediate: true,
      vendor: { id: "v8", name: "Givaudan India" },
    });
    expect(body.data.alerts[0].requiredBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("scopes policies and vendors to the caller's company", async () => {
    await exhaustionAlerts(request("/inventory/exhaustion-alerts"));
    const policyWheres = db.materialLocationPolicy.findMany.mock.calls.map((c) => c[0].where);
    expect(policyWheres.every((w) => w.material?.companyId === COMPANY)).toBe(true);
    const vendorWhere = db.vendorMaterial.findMany.mock.calls[0][0].where;
    expect(vendorWhere.material).toEqual({ companyId: COMPANY });
    expect(vendorWhere.vendor).toEqual({ companyId: COMPANY, isActive: true });
  });
});

describe("GET /api/v1/inventory/safety-stock", () => {
  beforeEach(() => {
    db.location.findMany.mockResolvedValue([{ id: "l-pune", code: "PUNE", name: "Pune Plant" }]);
    db.material.findMany.mockResolvedValue([
      { id: "m1", code: "RM-2087", name: "Stearic Acid", kind: "RAW", standardCost: D("145"), category: { name: "Chemical" }, unitOfMeasure: { code: "KG" } },
      { id: "m2", code: "FG-001", name: "Industrial Cleaning Compound 5L", kind: "FINISHED", standardCost: D("690"), category: { name: "Finished goods" }, unitOfMeasure: { code: "UNIT" } },
    ]);
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", onHandQty: D("180"), reservedQty: D("0"), quarantineQty: D("0"), valuation: D("26100"), lastMovementAt: new Date() },
      { materialId: "m2", locationId: "l-pune", onHandQty: D("440"), reservedQty: D("120"), quarantineQty: D("0"), valuation: D("303600"), lastMovementAt: new Date() },
    ]);
    db.materialLocationPolicy.findMany.mockResolvedValue([
      { materialId: "m1", locationId: "l-pune", reorderPoint: D("500"), safetyStock: D("100"), averageDailyDemand: D("42"), demandStdDev: D("18"), serviceLevel: D("0.9500"), procurementType: "BUY", productionLeadTimeDays: 0, safetyLeadTimeDays: 0 },
      { materialId: "m2", locationId: "l-pune", reorderPoint: D("400"), safetyStock: D("150"), averageDailyDemand: D("100"), demandStdDev: D("25"), serviceLevel: D("0.9700"), procurementType: "MAKE", productionLeadTimeDays: 2, safetyLeadTimeDays: 0 },
    ]);
    db.vendorMaterial.findMany.mockResolvedValue([
      { materialId: "m1", isPreferred: true, leadTimeDays: 14, vendor: { id: "v3", name: "Rashtriya Chemicals" } },
    ]);
  });

  it("returns current vs recommended with the inputs used", async () => {
    const res = await safetyStock(request("/inventory/safety-stock"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.rows.map((r: { code: string; recommended: number; gap: number }) => [r.code, r.recommended, r.gap]))
      .toEqual([["RM-2087", 111, -11], ["FG-001", 67, 83]]);
    expect(body.data.rows[0]).toMatchObject({
      averageDailyDemand: 42, demandStdDev: 18, serviceLevel: 0.95, z: 1.645,
      leadTimeDays: 14, leadTimeSource: "VENDOR", vendor: { name: "Rashtriya Chemicals" }, variability: "High",
    });
    expect(body.data.rows[1]).toMatchObject({ leadTimeSource: "PRODUCTION", vendor: null });
    expect(body.data.summary).toEqual({ withSafetyStock: 2, belowSafetyStock: 0, noBuffer: 0, underRecommended: 1, unavailable: 0 });
  });

  it("scopes policies and vendors to the caller's company", async () => {
    await safetyStock(request("/inventory/safety-stock"));
    const policyWheres = db.materialLocationPolicy.findMany.mock.calls.map((c) => c[0].where);
    expect(policyWheres.every((w) => w.material?.companyId === COMPANY)).toBe(true);
    expect(db.vendorMaterial.findMany.mock.calls[0][0].where.material).toEqual({ companyId: COMPANY });
  });
});
