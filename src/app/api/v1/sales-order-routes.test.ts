import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the sales order list and detail: authentication,
 * permission, tenant scoping, the anchored as-of date and response shape,
 * with the database and session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
  // These cases are written against the seeded demo's planning date.
  process.env.PLANNING_AS_OF_DATE = "2026-03-25";
});

const db = vi.hoisted(() => ({
  salesOrder: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  salesOrderLine: { findMany: vi.fn(), fields: { quantity: "quantity" } },
  stockMovement: { findMany: vi.fn() },
  inventoryBalance: { findMany: vi.fn() },
  workOrder: { findMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listSOs } from "./sales-orders/route";
import { GET as getSO } from "./sales-orders/[id]/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";

const actor = (permissions: string[]) => ({
  userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
  sessionId: "session-1", roles: ["PLANNER"], permissions: new Set(permissions),
});
const request = (path: string, signedIn = true) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, { headers: signedIn ? { cookie: "anvaya.session=token" } : {} });

const customer = { id: "c1", code: "CUST-001", name: "Reliance Retail", type: "MODERN_TRADE" };

const so = (over: Record<string, unknown> = {}) => ({
  id: "so-4538", companyId: COMPANY, orderNumber: "SO-4538", customerId: "c2",
  orderDate: day("2026-03-21"), requiredDate: day("2026-04-02"),
  status: "CONFIRMED", deliveryStatus: "PENDING", invoiceNumber: null, dispatchDate: null,
  totalAmount: D("487000"), currencyCode: "INR", notes: null,
  customer: { id: "c2", code: "CUST-002", name: "DMart Distribution", type: "MODERN_TRADE" },
  lines: [
    { id: "l1", quantity: D(500), shippedQty: D(0), unitPrice: D(890), lineTotal: D(445000), requiredDate: day("2026-04-02") },
    { id: "l2", quantity: D(300), shippedQty: D(0), unitPrice: D(140), lineTotal: D(42000), requiredDate: day("2026-04-02") },
  ],
  ...over,
});

const delivered = () => so({
  id: "so-4521", orderNumber: "SO-4521", orderDate: day("2026-03-19"), requiredDate: day("2026-03-24"),
  status: "DELIVERED", deliveryStatus: "DELIVERED", invoiceNumber: "INV-2026-1187", totalAmount: D("213600"), customer,
  lines: [{ id: "sol-1", quantity: D(240), shippedQty: D(240), unitPrice: D(890), lineTotal: D(213600), requiredDate: day("2026-03-24") }],
});

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["sales-order:read"]));
  db.stockMovement.findMany.mockResolvedValue([]);
  db.salesOrderLine.findMany.mockResolvedValue([]);
  db.salesOrder.count.mockResolvedValue(0);
  db.salesOrder.groupBy.mockResolvedValue([]);
  db.salesOrder.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { totalAmount: null } });
  db.inventoryBalance.findMany.mockResolvedValue([]);
  db.workOrder.findMany.mockResolvedValue([]);
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /sales-orders", (s: boolean) => listSOs(request("/sales-orders", s))],
    ["GET /sales-orders/:id", (s: boolean) => getSO(request("/sales-orders/so-1", s), { params: { id: "so-1" } })],
  ] as const;

  it.each(endpoints)("%s rejects an anonymous caller", async (_n, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call(false)).status).toBe(401);
  });

  it.each(endpoints)("%s needs sales-order:read", async (_n, call) => {
    session.resolveSession.mockResolvedValue(actor(["purchase-order:read"]));
    expect((await call(true)).status).toBe(403);
    expect(db.salesOrder.findMany).not.toHaveBeenCalled();
    expect(db.salesOrder.findFirst).not.toHaveBeenCalled();
  });
});

/*
 * The list's tab counts, "overdue" and headline figures are SQL over the whole
 * company; their arithmetic is proven against Postgres in
 * list-pagination.integration.test.ts. Here: the rows, the paging, the
 * company scoping of every query, and the dispatched value worked from the
 * month's ledger issues.
 */
describe("GET /api/v1/sales-orders", () => {
  it("lists one page of the caller's company's orders as of the planning date", async () => {
    db.salesOrder.findMany.mockResolvedValue([so(), delivered()]);
    db.salesOrder.groupBy.mockResolvedValue([{ status: "CONFIRMED", _count: { _all: 1 } }, { status: "DELIVERED", _count: { _all: 1 } }]);
    db.salesOrder.count.mockResolvedValue(2);
    db.salesOrder.aggregate.mockImplementation(({ where }: { where: { status?: { notIn?: string[] } } }) =>
      Promise.resolve(where.status?.notIn ? { _count: { _all: 1 }, _sum: { totalAmount: D(487000) } } : { _count: { _all: 0 }, _sum: { totalAmount: null } }));
    db.stockMovement.findMany.mockResolvedValue([{ referenceId: "sol-1", quantity: D(-240) }]);
    db.salesOrderLine.findMany.mockResolvedValue([{ id: "sol-1", unitPrice: D(890) }]);

    const res = await listSOs(request("/sales-orders"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(db.salesOrder.findMany.mock.calls[0][0]).toMatchObject({ where: { companyId: COMPANY }, take: 51 });
    for (const call of [...db.salesOrder.count.mock.calls, ...db.salesOrder.groupBy.mock.calls, ...db.salesOrder.aggregate.mock.calls]) {
      expect(call[0].where).toMatchObject({ companyId: COMPANY });
    }
    // This month's dispatches, for this company's own materials and lines only.
    expect(db.stockMovement.findMany.mock.calls[0][0].where).toMatchObject({
      type: "ISSUE", referenceType: "SALES_ORDER_LINE", material: { companyId: COMPANY },
      occurredAt: { gte: new Date("2026-03-01T00:00:00Z"), lt: new Date("2026-03-26T00:00:00Z") },
    });
    expect(db.salesOrderLine.findMany.mock.calls[0][0].where).toMatchObject({ id: { in: ["sol-1"] }, salesOrder: { companyId: COMPANY } });
    expect(body.data.asOf).toBe("2026-03-25T00:00:00.000Z");
    expect(body.data.orders[0]).toEqual({
      id: "so-4538", orderNumber: "SO-4538",
      customer: { id: "c2", code: "CUST-002", name: "DMart Distribution", type: "MODERN_TRADE" },
      orderDate: "2026-03-21", requiredDate: "2026-04-02", status: "CONFIRMED", deliveryStatus: "PENDING",
      invoiceNumber: null, dispatchDate: null, totalAmount: 487000, currencyCode: "INR",
      lineCount: 2, overdue: false, totalMismatch: false,
    });
    expect(body.data.counts).toMatchObject({ all: 2, CONFIRMED: 1, DELIVERED: 1 });
    expect(body.data.kpis).toEqual({
      open: { count: 1, value: 487000 },
      dueNext7Days: { count: 0, value: 0 },
      bookedToday: { count: 0, value: 0 },
      dispatchedMtd: 213600,
    });
    expect(body.meta).toEqual({ nextCursor: null, limit: 50, total: 2 });
  });

  it("passes the tab, search and page through, and refuses an oversized page", async () => {
    db.salesOrder.findMany.mockResolvedValue([]);
    await listSOs(request("/sales-orders?status=overdue&q=dmart&limit=10&cursor=so-1"));
    expect(db.salesOrder.findMany.mock.calls[0][0]).toMatchObject({ take: 11, cursor: { id: "so-1" }, skip: 1 });
    expect((await listSOs(request("/sales-orders?limit=201"))).status).toBe(422);
    expect((await listSOs(request("/sales-orders?status=SHIPPED"))).status).toBe(422);
  });

  it("marks an order awaiting dispatch past its line date as overdue", async () => {
    db.salesOrder.findMany.mockResolvedValue([so({
      lines: [{ id: "l1", quantity: D(10), shippedQty: D(0), unitPrice: D(1), lineTotal: D(10), requiredDate: day("2026-03-20") }],
      totalAmount: D(10),
    })]);
    const body = await (await listSOs(request("/sales-orders"))).json();
    expect(body.data.orders[0].overdue).toBe(true);
  });

  it("flags a header total that disagrees with its lines", async () => {
    db.salesOrder.findMany.mockResolvedValue([so({ totalAmount: D(1) })]);
    const body = await (await listSOs(request("/sales-orders"))).json();
    expect(body.data.orders[0].totalMismatch).toBe(true);
  });

  it("returns an empty page and zeroed figures when there are no orders", async () => {
    db.salesOrder.findMany.mockResolvedValue([]);
    const body = await (await listSOs(request("/sales-orders"))).json();
    expect(body.data.orders).toEqual([]);
    expect(body.data.kpis).toEqual({ open: { count: 0, value: 0 }, dueNext7Days: { count: 0, value: 0 }, bookedToday: { count: 0, value: 0 }, dispatchedMtd: 0 });
    // No dispatches this month, so no prices to look up.
    expect(db.salesOrderLine.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/sales-orders/:id", () => {
  const detailLine = (over: Record<string, unknown> = {}) => ({
    id: "sol-1", lineNumber: 1, materialId: "m-fg1", locationId: "l-pune",
    quantity: D(240), shippedQty: D(240), unitPrice: D(890), lineTotal: D(213600), requiredDate: day("2026-03-24"),
    material: { id: "m-fg1", code: "FG-001", name: "Industrial Cleaning Compound 5L", isBatchTracked: true, unitOfMeasure: { code: "UNIT" } },
    location: { id: "l-pune", name: "Pune Plant" },
    ...over,
  });

  it("returns lines with shipped lots, stock and open work orders for the material", async () => {
    db.salesOrder.findFirst.mockResolvedValue({ ...delivered(), dispatchDate: day("2026-03-24"), lines: [detailLine()] });
    db.stockMovement.findMany.mockResolvedValue([{ referenceId: "sol-1", quantity: D(-240), lot: { id: "lot-fg", lotNumber: "FGB-2026-0091" } }]);
    db.inventoryBalance.findMany.mockResolvedValue([
      { materialId: "m-fg1", locationId: "l-pune", onHandQty: D(260), reservedQty: D(40), quarantineQty: D(20) },
      { materialId: "m-fg1", locationId: "l-other", onHandQty: D(999), reservedQty: D(0), quarantineQty: D(0) },
    ]);
    db.workOrder.findMany.mockResolvedValue([
      { id: "wo-1", orderNumber: "WO-2026-0104", status: "RELEASED", materialId: "m-fg1", locationId: "l-pune", plannedQty: D(500), producedQty: D(0), plannedEndDate: day("2026-03-30") },
      { id: "wo-2", orderNumber: "WO-2026-0999", status: "PLANNED", materialId: "m-fg1", locationId: "l-other", plannedQty: D(50), producedQty: D(0), plannedEndDate: day("2026-04-02") },
    ]);

    const body = await (await getSO(request("/sales-orders/so-4521"), { params: { id: "so-4521" } })).json();

    expect(db.salesOrder.findFirst.mock.calls[0][0].where).toEqual({ id: "so-4521", companyId: COMPANY });
    expect(db.workOrder.findMany.mock.calls[0][0].where).toMatchObject({ companyId: COMPANY, materialId: { in: ["m-fg1"] } });
    expect(body.data).toMatchObject({
      orderNumber: "SO-4521", totalAmount: 213600, dispatchDate: "2026-03-24", asOf: "2026-03-25T00:00:00.000Z",
      overdue: false, lineCount: 1,
    });
    expect(body.data.lines[0]).toEqual({
      id: "sol-1",
      lineNumber: 1,
      material: { id: "m-fg1", code: "FG-001", name: "Industrial Cleaning Compound 5L", isBatchTracked: true },
      uom: "UNIT",
      location: { id: "l-pune", name: "Pune Plant" },
      quantity: 240, shippedQty: 240, openQty: 0, unitPrice: 890, lineTotal: 213600, requiredDate: "2026-03-24", overdue: false,
      lots: [{ id: "lot-fg", lotNumber: "FGB-2026-0091", quantity: 240 }],
      stock: { onHand: 260, reserved: 40, quarantine: 20, available: 200 },
      openWorkOrders: [{ id: "wo-1", orderNumber: "WO-2026-0104", status: "RELEASED", plannedQty: 500, producedQty: 0, plannedEndDate: "2026-03-30" }],
    });
  });

  it("reports no stock rather than zero when the location has no balance", async () => {
    db.salesOrder.findFirst.mockResolvedValue(so({ lines: [detailLine({ shippedQty: D(0), requiredDate: day("2026-04-02") })] }));
    const body = await (await getSO(request("/sales-orders/so-4538"), { params: { id: "so-4538" } })).json();
    expect(body.data.lines[0]).toMatchObject({ openQty: 240, stock: null, openWorkOrders: [] });
  });

  it("returns 404 for another company's order", async () => {
    db.salesOrder.findFirst.mockResolvedValue(null);
    expect((await getSO(request("/sales-orders/x"), { params: { id: "x" } })).status).toBe(404);
  });
});
