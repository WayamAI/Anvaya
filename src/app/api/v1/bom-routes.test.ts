import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the BOM list, BOM tree and component detail:
 * authentication, permission, tenant scoping, the purchasing-data gate and
 * response shape, with the database and session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  bom: { findMany: vi.fn() },
  material: { findMany: vi.fn() },
  location: { findMany: vi.fn() },
  materialLocationPolicy: { findMany: vi.fn() },
  vendorMaterial: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  purchaseOrderLine: { findMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listBoms } from "./boms/route";
import { GET as getBom } from "./boms/[id]/route";
import { GET as getComponent } from "./boms/components/[materialId]/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";

const actor = (permissions: string[]) => ({
  userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
  sessionId: "session-1", roles: ["PLANNER"], permissions: new Set(permissions),
});
const request = (path: string, signedIn = true) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, { headers: signedIn ? { cookie: "anvaya.session=token" } : {} });

const material = (id: string, code: string, kind: string, uom: string, cost: number) => ({
  id, code, name: `Name ${code}`, kind, standardCost: D(cost), isBatchTracked: true, isActive: true,
  unitOfMeasure: { code: uom }, category: { name: "Cat" },
});
const component = (materialId: string, position: number, quantity: number, uom: string, scrap: number) => ({
  materialId, position, quantity: D(quantity), unitOfMeasure: { code: uom }, scrapFactor: D(scrap), leadTimeOffsetDays: 0, isOptional: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["bom:read", "purchase-order:read"]));
  db.material.findMany.mockResolvedValue([
    material("m-fg", "FG-001", "FINISHED", "UNIT", 690),
    material("m-fg2", "FG-002", "FINISHED", "UNIT", 210),
    material("m-sa", "SA-101", "SEMI_FINISHED", "L", 196),
    material("m-sls", "RM-4023", "RAW", "KG", 185),
  ]);
  db.bom.findMany.mockResolvedValue([
    {
      id: "b-fg", code: "BOM-FG-001", name: "FG", description: null, materialId: "m-fg",
      versions: [{ id: "v-fg", version: "A", isActive: true, effectiveFrom: day("2026-01-01"), effectiveTo: null, baseQuantity: D(1),
        components: [component("m-sa", 10, 2.5, "L", 0.02)] }],
    },
    {
      id: "b-sa", code: "BOM-SA-101", name: "SA", description: null, materialId: "m-sa",
      versions: [{ id: "v-sa", version: "A", isActive: true, effectiveFrom: day("2026-01-01"), effectiveTo: null, baseQuantity: D(100),
        components: [component("m-sls", 10, 32, "KG", 0.02)] }],
    },
  ]);
  db.location.findMany.mockResolvedValue([{ id: "l-pune", code: "PUNE", name: "Pune Plant", isManufacturing: true }]);
  db.materialLocationPolicy.findMany.mockResolvedValue([
    { materialId: "m-sls", locationId: "l-pune", procurementType: "BUY", productionLeadTimeDays: 0, safetyLeadTimeDays: 0,
      averageDailyDemand: D(42), demandStdDev: D(12), serviceLevel: D("0.95"), safetyStock: D(200), reorderPoint: D(800) },
    { materialId: "m-sa", locationId: "l-pune", procurementType: "MAKE", productionLeadTimeDays: 1, safetyLeadTimeDays: 0,
      averageDailyDemand: D(250), demandStdDev: D(40), serviceLevel: D("0.95"), safetyStock: D(200), reorderPoint: D(800) },
  ]);
  db.vendorMaterial.findMany.mockResolvedValue([
    { materialId: "m-sls", isPreferred: true, leadTimeDays: 7, vendor: { id: "v1", name: "Galaxy Surfactants" } },
  ]);
  db.inventoryBalance.findMany.mockResolvedValue([
    { materialId: "m-sls", locationId: "l-pune", onHandQty: D(1050), reservedQty: D(0), quarantineQty: D(0), valuation: D(194250), lastMovementAt: new Date() },
  ]);
  db.purchaseOrderLine.findMany.mockResolvedValue([
    { orderedQty: D(800), receivedQty: D(0), unitPrice: D(185), expectedDeliveryDate: day("2026-04-03"),
      purchaseOrder: { orderNumber: "PO-2026-0255", status: "ORDERED", orderDate: day("2026-03-20") } },
    { orderedQty: D(1200), receivedQty: D(1200), unitPrice: D(182), expectedDeliveryDate: day("2026-02-15"),
      purchaseOrder: { orderNumber: "PO-2026-0198", status: "FULLY_RECEIVED", orderDate: day("2026-02-05") } },
  ]);
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /boms", (s: boolean) => listBoms(request("/boms", s))],
    ["GET /boms/:id", (s: boolean) => getBom(request("/boms/b-fg", s), { params: { id: "b-fg" } })],
    ["GET /boms/components/:materialId", (s: boolean) => getComponent(request("/boms/components/m-sls", s), { params: { materialId: "m-sls" } })],
  ] as const;

  it.each(endpoints)("%s returns 401 without a session", async (_n, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call(false)).status).toBe(401);
  });

  it.each(endpoints)("%s returns 403 without bom:read", async (_n, call) => {
    session.resolveSession.mockResolvedValue(actor(["inventory:read", "purchase-order:read"]));
    const res = await call(true);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("bom:read");
  });
});

describe("GET /api/v1/boms", () => {
  it("lists made products, with null for those without a BOM", async () => {
    const body = await (await listBoms(request("/boms"))).json();
    expect(body.data.map((p: { code: string; bom: { code: string } | null }) => [p.code, p.bom?.code ?? null]))
      .toEqual([["FG-001", "BOM-FG-001"], ["FG-002", null], ["SA-101", "BOM-SA-101"]]);
    expect(body.data[0].bom).toMatchObject({ activeVersion: "A", versions: 1, components: 1 });
    expect(db.bom.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
    expect(db.material.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
  });
});

describe("GET /api/v1/boms/:id", () => {
  it("returns the multi-level tree, versions and cost roll-up", async () => {
    const body = await (await getBom(request("/boms/b-fg"), { params: { id: "b-fg" } })).json();
    const sa = body.data.tree.children[0];
    expect(sa).toMatchObject({ code: "SA-101", qtyPerParent: 2.5, grossPerParent: 2.55, leadTimeDays: 1, leadTimeSource: "PRODUCTION" });
    expect(sa.children[0]).toMatchObject({ code: "RM-4023", qtyPerParent: 0.32, qtyPerTop: 0.83232, leadTimeDays: 7, leadTimeSource: "VENDOR" });
    expect(body.data.version).toMatchObject({ version: "A", effectiveTo: null, effectivityProgress: null });
    // 0.3264 × 185 × 2.55
    expect(body.data.cost).toEqual({ rolledMaterialCost: 153.9792, standardCost: 690 });
  });

  it("returns 404 for another company's BOM, or an unknown version", async () => {
    expect((await getBom(request("/boms/elsewhere"), { params: { id: "elsewhere" } })).status).toBe(404);
    expect((await getBom(request("/boms/b-fg?version=Z"), { params: { id: "b-fg" } })).status).toBe(404);
  });
});

describe("GET /api/v1/boms/components/:materialId", () => {
  it("returns stock, vendors, purchasing and where-used", async () => {
    const body = await (await getComponent(request("/boms/components/m-sls"), { params: { materialId: "m-sls" } })).json();
    expect(body.data).toMatchObject({
      procurementType: "BUY",
      stock: { total: 1050, byLocation: [{ name: "Pune Plant", onHand: 1050 }] },
      vendors: { primary: { name: "Galaxy Surfactants", leadTimeDays: 7 }, alternates: [] },
      purchasing: {
        openLines: [{ purchaseOrderNumber: "PO-2026-0255", status: "ORDERED", outstandingQty: 800, expectedDate: "2026-04-03" }],
        lastPurchase: { unitPrice: 185, purchaseOrderNumber: "PO-2026-0255", orderDate: "2026-03-20" },
      },
    });
    expect(body.data.whereUsed.map((w: { product: { code: string }; direct: boolean }) => [w.product.code, w.direct]))
      .toEqual([["SA-101", true], ["FG-001", false]]);
    expect(db.purchaseOrderLine.findMany.mock.calls[0][0].where.purchaseOrder).toMatchObject({ companyId: COMPANY });
  });

  it("withholds purchasing data without purchase-order:read", async () => {
    session.resolveSession.mockResolvedValue(actor(["bom:read"]));
    const body = await (await getComponent(request("/boms/components/m-sls"), { params: { materialId: "m-sls" } })).json();
    expect(body.data.purchasing).toBeNull();
    expect(db.purchaseOrderLine.findMany).not.toHaveBeenCalled();
    expect(body.data.stock.total).toBe(1050);
  });

  it("returns 404 for a material outside the company", async () => {
    expect((await getComponent(request("/boms/components/nope"), { params: { materialId: "nope" } })).status).toBe(404);
  });
});
