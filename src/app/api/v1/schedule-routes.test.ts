import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the production schedule: authentication,
 * permission, tenant scoping and response shape, with the database and
 * session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  workOrder: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  productionConstraint: { findMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as getSchedule } from "./production/schedule/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";

const actor = (permissions: string[]) => ({
  userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
  sessionId: "session-1", roles: ["PRODUCTION"], permissions: new Set(permissions),
});
const request = (signedIn = true) =>
  new NextRequest("http://localhost:8080/api/v1/production/schedule", { headers: signedIn ? { cookie: "anvaya.session=token" } : {} });

// One list row (listWorkOrders) and one detail row share the order id; the
// mock serves both findMany calls, so each row carries both shapes.
const orderRow = (id: string, over: Record<string, unknown>) => ({
  id, companyId: COMPANY, orderNumber: id.toUpperCase(), materialId: "m", locationId: "l-pune", bomVersionId: null,
  plannedQty: D(600), producedQty: D(0), scrappedQty: D(0),
  plannedStartDate: day("2026-03-26"), plannedEndDate: day("2026-03-27"), actualStartDate: null, actualEndDate: null,
  status: "RELEASED", priority: 0, notes: null,
  material: { id: "m-sa", code: "SA-101", name: "Concentrate Base", unitOfMeasure: { code: "L" } },
  location: { id: "l-pune", name: "Pune Plant" },
  bomVersion: null,
  operations: [{ sequence: 10, workCentre: "BLEND-01", setupMinutes: D(40), runMinutes: D(300) }],
  components: [{
    lotId: null, materialId: "m-sls", requiredQty: D("195.84"), issuedQty: D(0),
    material: { code: "RM-4023", name: "Sodium Lauryl Sulphate", unitOfMeasure: { code: "KG" } },
  }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["work-order:read"]));
  db.workOrder.findMany.mockResolvedValue([orderRow("wo-104", {})]);
  db.inventoryBalance.findMany.mockResolvedValue([{ materialId: "m-sls", locationId: "l-pune", onHandQty: D(100) }]);
  db.productionConstraint.findMany.mockResolvedValue([{
    id: "c1", name: "Blending line BLEND-01", type: "CAPACITY", unit: "litres/day", capacity: D(4000), utilised: D(3100),
    effectiveFrom: day("2026-01-01"), effectiveTo: null, location: { id: "l-pune", name: "Pune Plant" },
  }]);
});

describe("GET /api/v1/production/schedule", () => {
  it("returns 401 without a session and 403 without work-order:read", async () => {
    session.resolveSession.mockResolvedValue(null);
    expect((await getSchedule(request(false))).status).toBe(401);
    session.resolveSession.mockResolvedValue(actor(["inventory:read"]));
    const res = await getSchedule(request());
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("work-order:read");
  });

  it("returns bars, unit-matched load, shortages and stored constraints", async () => {
    const res = await getSchedule(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.bars).toEqual([expect.objectContaining({
      workCentre: "BLEND-01", orderNumber: "WO-104", start: "2026-03-26", end: "2026-03-27", days: 2, setupMinutes: 40, runMinutes: 300,
    })]);
    expect(body.data.loads[0]).toMatchObject({ workCentre: "BLEND-01", peak: { load: 300, pct: 7.5 }, overloaded: false });
    expect(body.data.orders[0]).toMatchObject({
      orderNumber: "WO-104", overdue: true, workCentres: ["BLEND-01"],
      shortages: [{ code: "RM-4023", shortfall: 95.84, uom: "KG" }],
    });
    const kinds = body.data.constraints.map((c: { kind: string }) => c.kind);
    expect(kinds).toEqual(["SHORTAGE", "OVERDUE", "STORED"]);
    expect(body.data.constraints[2].stored).toMatchObject({ utilised: 3100, capacity: 4000, recordedPct: 77.5 });
  });

  it("scopes orders, stock and constraints to the caller's company", async () => {
    await getSchedule(request());
    for (const call of db.workOrder.findMany.mock.calls) expect(call[0].where).toEqual({ companyId: COMPANY });
    expect(db.productionConstraint.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY, isActive: true });
    expect(db.inventoryBalance.findMany.mock.calls[0][0].where).toMatchObject({ material: { companyId: COMPANY }, locationId: { in: ["l-pune"] } });
  });

  it("does not assess readiness for finished orders", async () => {
    db.workOrder.findMany.mockResolvedValue([orderRow("wo-91", { status: "COMPLETED" })]);
    const body = await (await getSchedule(request())).json();
    expect(body.data.orders[0].shortages).toBeNull();
    expect(db.inventoryBalance.findMany).not.toHaveBeenCalled();
  });
});
