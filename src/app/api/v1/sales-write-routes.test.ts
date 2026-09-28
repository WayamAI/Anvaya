import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for the sales write endpoints: authentication,
 * permission, body validation and idempotent dispatch, with the services
 * mocked. The services are proven against Postgres in sales.integration.test.ts.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const writes = vi.hoisted(() => ({
  createSalesOrder: vi.fn(), updateSalesOrder: vi.fn(), cancelSalesOrder: vi.fn(),
  deliverSalesOrder: vi.fn(), dispatchSalesOrder: vi.fn(),
}));
const reads = vi.hoisted(() => ({ getSalesOrder: vi.fn(), listSalesOrders: vi.fn() }));
const customers = vi.hoisted(() => ({ listCustomers: vi.fn() }));
const idem = vi.hoisted(() => ({ runIdempotent: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session", resolveSession: session.resolveSession, touchSession: vi.fn(),
}));
vi.mock("@/server/services/sales-order-write.service", () => writes);
vi.mock("@/server/services/sales-order.service", () => reads);
vi.mock("@/server/services/customer.service", () => customers);
vi.mock("@/server/api/idempotency", async (orig) => ({
  ...(await orig<typeof import("@/server/api/idempotency")>()),
  runIdempotent: idem.runIdempotent,
}));

import { POST as createSO } from "./sales-orders/route";
import { PATCH as patchSO } from "./sales-orders/[id]/route";
import { POST as cancelSO } from "./sales-orders/[id]/cancel/route";
import { POST as deliverSO } from "./sales-orders/[id]/deliver/route";
import { POST as dispatchSO } from "./sales-orders/[id]/dispatches/route";
import { GET as listCustomers } from "./customers/route";

const actor = (permissions: string[]) => ({
  userId: "u1", companyId: "c1", email: "s@anvaya.in", name: "Sales", sessionId: "s1", roles: ["PLANNER"],
  permissions: new Set(permissions),
});
const request = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method,
    headers: { cookie: "anvaya.session=t", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const validSO = { customerId: "c", locationId: "l", requiredDate: "2026-10-10", lines: [{ materialId: "m", quantity: 5, unitPrice: 100 }] };
const validDispatch = { lines: [{ salesOrderLineId: "sl", quantity: 5 }] };
const p = { params: { id: "so-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor([
    "sales-order:create", "sales-order:update", "sales-order:dispatch", "customer:read",
  ]));
  reads.getSalesOrder.mockResolvedValue({ id: "so-1", orderNumber: "SO-4567" });
  writes.createSalesOrder.mockResolvedValue({ id: "so-1", orderNumber: "SO-4567" });
  customers.listCustomers.mockResolvedValue([]);
});

describe("permissions", () => {
  const cases = [
    ["POST /sales-orders", "sales-order:create", () => createSO(request("/sales-orders", "POST", validSO))],
    ["PATCH /sales-orders/:id", "sales-order:update", () => patchSO(request("/sales-orders/so-1", "PATCH", { notes: "x" }), p)],
    ["POST /sales-orders/:id/cancel", "sales-order:update", () => cancelSO(request("/sales-orders/so-1/cancel", "POST", { reason: "abc" }), p)],
    ["POST /sales-orders/:id/dispatches", "sales-order:dispatch", () => dispatchSO(request("/sales-orders/so-1/dispatches", "POST", validDispatch), p)],
    ["POST /sales-orders/:id/deliver", "sales-order:dispatch", () => deliverSO(request("/sales-orders/so-1/deliver", "POST", {}), p)],
    ["GET /customers", "customer:read", () => listCustomers(request("/customers", "GET"))],
  ] as const;

  it.each(cases)("%s needs a session", async (_n, _p, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["sales-order:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });
});

describe("sales order routes", () => {
  it("books with 201 and a Location header", async () => {
    const res = await createSO(request("/sales-orders", "POST", validSO));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/v1/sales-orders/so-1");
  });

  it("rejects a negative price and a fractional date before the service runs", async () => {
    const res = await createSO(request("/sales-orders", "POST", { ...validSO, requiredDate: "2026-13-01", lines: [{ materialId: "m", quantity: 1, unitPrice: -1 }] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.map((d: { path: string }) => d.path).sort()).toEqual(["lines.0.unitPrice", "requiredDate"]);
    expect(writes.createSalesOrder).not.toHaveBeenCalled();
  });

  it("scopes the dispatch idempotency key to the order", async () => {
    idem.runIdempotent.mockResolvedValue({ status: 201, body: { salesOrder: { id: "so-1" } }, replayed: true });
    const res = await dispatchSO(request("/sales-orders/so-1/dispatches", "POST", validDispatch, { "idempotency-key": "k-1" }), p);
    expect(res.status).toBe(201);
    expect(res.headers.get("idempotent-replayed")).toBe("true");
    expect(idem.runIdempotent.mock.calls[0][0]).toMatchObject({ key: "k-1", scope: "sales-order:dispatch:so-1" });
  });
});
