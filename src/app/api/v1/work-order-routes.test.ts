import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the work order list and detail: authentication,
 * permission, tenant scoping and response shape, with the database and
 * session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  workOrder: { findMany: vi.fn(), findFirst: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  stockMovement: { findMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listWorkOrders } from "./work-orders/route";
import { GET as getWorkOrder } from "./work-orders/[id]/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";

const actor = (permissions: string[]) => ({
  userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
  sessionId: "session-1", roles: ["PRODUCTION"], permissions: new Set(permissions),
});
const request = (path: string, signedIn = true) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, { headers: signedIn ? { cookie: "anvaya.session=token" } : {} });

function order(over: Record<string, unknown> = {}) {
  return {
    id: "wo-91", companyId: COMPANY, orderNumber: "WO-2026-0091", materialId: "m-fg", locationId: "l-pune",
    bomVersionId: "bv1", plannedQty: D("500"), producedQty: D("500"), scrappedQty: D("0"),
    plannedStartDate: day("2026-03-10"), plannedEndDate: day("2026-03-14"), actualStartDate: null, actualEndDate: null,
    status: "COMPLETED", priority: 0, notes: null, createdAt: day("2026-03-01"), updatedAt: day("2026-03-01"),
    material: { id: "m-fg", code: "FG-001", name: "Industrial Cleaning Compound 5L", unitOfMeasure: { code: "UNIT" } },
    location: { id: "l-pune", name: "Pune Plant" },
    bomVersion: { version: "A", bom: { code: "BOM-FG-001" } },
    operations: [{ sequence: 20, workCentre: "FILL-02" }, { sequence: 10, workCentre: "BLEND-01" }],
    components: [{ lotId: "lot-1" }, { lotId: null }, { lotId: null }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["work-order:read"]));
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /work-orders", (s: boolean) => listWorkOrders(request("/work-orders", s))],
    ["GET /work-orders/:id", (s: boolean) => getWorkOrder(request("/work-orders/wo-91", s), { params: { id: "wo-91" } })],
  ] as const;

  it.each(endpoints)("%s returns 401 without a session", async (_n, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call(false)).status).toBe(401);
  });

  it.each(endpoints)("%s returns 403 without work-order:read", async (_n, call) => {
    session.resolveSession.mockResolvedValue(actor(["inventory:read"]));
    const res = await call(true);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("work-order:read");
  });
});

describe("GET /api/v1/work-orders", () => {
  it("lists orders with derived overdue, route, trace and counts", async () => {
    db.workOrder.findMany.mockResolvedValue([
      order({ id: "wo-104", orderNumber: "WO-2026-0104", status: "RELEASED", producedQty: D("0"), plannedEndDate: day("2026-03-27") }),
      order(),
    ]);

    const body = await (await listWorkOrders(request("/work-orders"))).json();

    expect(db.workOrder.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY });
    expect(body.data.counts).toMatchObject({ all: 2, overdue: 1, RELEASED: 1, COMPLETED: 1 });
    expect(body.data.orders[0]).toMatchObject({ orderNumber: "WO-2026-0104", overdue: true, traceComplete: null });
    expect(body.data.orders[1]).toMatchObject({
      orderNumber: "WO-2026-0091", status: "COMPLETED", overdue: false,
      plannedQty: 500, producedQty: 500, uom: "UNIT",
      bom: { code: "BOM-FG-001", version: "A" },
      workCentres: ["BLEND-01", "FILL-02"],
      componentCount: 3, componentsWithLot: 1, traceComplete: 33,
      plannedStartDate: "2026-03-10", plannedEndDate: "2026-03-14",
    });
  });
});

describe("GET /api/v1/work-orders/:id", () => {
  const detailOrder = (status: string) => order({
    status,
    operations: [
      { sequence: 10, name: "Charge & mix", workCentre: "BLEND-01", status: "PENDING", setupMinutes: D("40"), runMinutes: D("300") },
    ],
    components: [
      {
        materialId: "m-sls", lotId: null, requiredQty: D("1275"), issuedQty: D("0"), requiredDate: day("2026-03-26"),
        material: { id: "m-sls", code: "RM-4023", name: "Sodium Lauryl Sulphate", kind: "RAW", unitOfMeasure: { code: "KG" } },
        lot: null,
      },
      {
        materialId: "m-w", lotId: "lot-w", requiredQty: D("100"), issuedQty: D("0"), requiredDate: day("2026-03-26"),
        material: { id: "m-w", code: "RM-7044", name: "Demineralised Water", kind: "RAW", unitOfMeasure: { code: "L" } },
        lot: { id: "lot-w", lotNumber: "RMB-X", qcStatus: "APPROVED" },
      },
    ],
  });

  it("returns 404 for a missing or other-company order", async () => {
    db.workOrder.findFirst.mockResolvedValue(null);
    const res = await getWorkOrder(request("/work-orders/x"), { params: { id: "x" } });
    expect(res.status).toBe(404);
    expect(db.workOrder.findFirst.mock.calls[0][0].where).toEqual({ id: "x", companyId: COMPANY });
  });

  it("judges an open order's components against stock at its location", async () => {
    db.workOrder.findFirst.mockResolvedValue(detailOrder("RELEASED"));
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m-sls", onHandQty: D("1050") },
      { materialId: "m-w", onHandQty: D("8000") },
    ]);
    db.stockMovement.findMany.mockResolvedValue([]);

    const body = await (await getWorkOrder(request("/work-orders/wo-104"), { params: { id: "wo-104" } })).json();

    expect(db.inventoryBalance.findMany.mock.calls[0][0].where).toEqual({
      locationId: "l-pune", materialId: { in: ["m-sls", "m-w"] }, material: { companyId: COMPANY },
    });
    expect(body.data.components[0].readiness).toEqual({ outstanding: 1275, onHand: 1050, shortfall: 225, status: "short" });
    expect(body.data.components[1]).toMatchObject({ lot: { lotNumber: "RMB-X" }, readiness: { status: "available" } });
    expect(body.data.shortComponents).toBe(1);
    expect(body.data.operations[0]).toMatchObject({ name: "Charge & mix", setupMinutes: 40, runMinutes: 300, status: "PENDING" });
  });

  it("skips readiness for a finished order and lists the lots it produced", async () => {
    db.workOrder.findFirst.mockResolvedValue(detailOrder("COMPLETED"));
    db.stockMovement.findMany.mockResolvedValue([
      { quantity: D("500"), occurredAt: day("2026-03-14"), lot: { id: "lot-fg", lotNumber: "FGB-2026-0091", qcStatus: "APPROVED" } },
    ]);

    const body = await (await getWorkOrder(request("/work-orders/wo-91"), { params: { id: "wo-91" } })).json();

    expect(db.inventoryBalance.findMany).not.toHaveBeenCalled();
    expect(body.data.components.every((c: { readiness: unknown }) => c.readiness === null)).toBe(true);
    expect(body.data.shortComponents).toBeNull();
    expect(body.data.outputLots).toEqual([{ id: "lot-fg", lotNumber: "FGB-2026-0091", quantity: 500, qcStatus: "APPROVED", producedAt: "2026-03-14" }]);
    const moveWhere = db.stockMovement.findMany.mock.calls[0][0].where;
    expect(moveWhere).toMatchObject({ referenceType: "WORK_ORDER", referenceId: "wo-91", material: { companyId: COMPANY } });
  });
});
