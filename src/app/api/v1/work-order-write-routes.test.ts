import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for the work order write endpoints: authentication,
 * permission, validation and idempotency scoping, with services mocked.
 * The services are proven against Postgres in production.integration.test.ts.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const writes = vi.hoisted(() => ({
  createWorkOrder: vi.fn(), updateWorkOrder: vi.fn(), firmWorkOrder: vi.fn(), releaseWorkOrder: vi.fn(),
  completeWorkOrder: vi.fn(), closeWorkOrder: vi.fn(), cancelWorkOrder: vi.fn(),
  issueComponents: vi.fn(), reportOutput: vi.fn(),
}));
const reads = vi.hoisted(() => ({ getWorkOrder: vi.fn(), listWorkOrders: vi.fn() }));
const idem = vi.hoisted(() => ({ runIdempotent: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session", resolveSession: session.resolveSession, touchSession: vi.fn(),
}));
vi.mock("@/server/services/work-order-write.service", () => writes);
vi.mock("@/server/services/work-order.service", () => reads);
vi.mock("@/server/api/idempotency", async (orig) => ({
  ...(await orig<typeof import("@/server/api/idempotency")>()),
  runIdempotent: idem.runIdempotent,
}));

import { POST as createWO } from "./work-orders/route";
import { PATCH as patchWO } from "./work-orders/[id]/route";
import { POST as firm } from "./work-orders/[id]/firm/route";
import { POST as release } from "./work-orders/[id]/release/route";
import { POST as complete } from "./work-orders/[id]/complete/route";
import { POST as close } from "./work-orders/[id]/close/route";
import { POST as cancel } from "./work-orders/[id]/cancel/route";
import { POST as issues } from "./work-orders/[id]/issues/route";
import { POST as output } from "./work-orders/[id]/output/route";

const actor = (permissions: string[]) => ({
  userId: "u1", companyId: "c1", email: "p@anvaya.in", name: "Prod", sessionId: "s1", roles: ["PRODUCTION"],
  permissions: new Set(permissions),
});
const request = (path: string, body?: unknown, method = "POST", headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method,
    headers: { cookie: "anvaya.session=t", "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const p = { params: { id: "wo-1" } };
const validWO = { materialId: "m", locationId: "l", plannedQty: 10, plannedStartDate: "2026-10-01", plannedEndDate: "2026-10-03" };

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["work-order:create", "work-order:update"]));
  reads.getWorkOrder.mockResolvedValue({ id: "wo-1", orderNumber: "WO-2026-0001" });
  writes.createWorkOrder.mockResolvedValue({ id: "wo-1", orderNumber: "WO-2026-0001" });
  idem.runIdempotent.mockResolvedValue({ status: 201, body: {}, replayed: false });
});

describe("permissions", () => {
  const cases = [
    ["POST /work-orders", "work-order:create", () => createWO(request("/work-orders", validWO))],
    ["PATCH /work-orders/:id", "work-order:update", () => patchWO(request("/work-orders/wo-1", { priority: 1 }, "PATCH"), p)],
    ["POST firm", "work-order:update", () => firm(request("/work-orders/wo-1/firm"), p)],
    ["POST release", "work-order:update", () => release(request("/work-orders/wo-1/release"), p)],
    ["POST complete", "work-order:update", () => complete(request("/work-orders/wo-1/complete"), p)],
    ["POST close", "work-order:update", () => close(request("/work-orders/wo-1/close"), p)],
    ["POST cancel", "work-order:update", () => cancel(request("/work-orders/wo-1/cancel", { reason: "abc" }), p)],
    ["POST issues", "work-order:update", () => issues(request("/work-orders/wo-1/issues", { lines: [{ materialId: "m", quantity: 1 }] }), p)],
    ["POST output", "work-order:update", () => output(request("/work-orders/wo-1/output", { quantity: 1 }), p)],
  ] as const;

  it.each(cases)("%s needs a session", async (_n, _p, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["work-order:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });
});

describe("work order routes", () => {
  it("plans with 201 and a Location header", async () => {
    const res = await createWO(request("/work-orders", validWO));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/v1/work-orders/wo-1");
  });

  it("refuses an empty output report", async () => {
    const res = await output(request("/work-orders/wo-1/output", { quantity: 0 }), p);
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toEqual([{ path: "quantity", message: "report some output or scrap, or complete the order" }]);
  });

  it("scopes issue and output idempotency keys to the order and the operation", async () => {
    await issues(request("/work-orders/wo-1/issues", { lines: [{ materialId: "m", quantity: 1 }] }, "POST", { "idempotency-key": "k" }), p);
    await output(request("/work-orders/wo-1/output", { quantity: 1 }, "POST", { "idempotency-key": "k2" }), p);
    expect(idem.runIdempotent.mock.calls.map((c) => c[0].scope)).toEqual(["work-order:issue:wo-1", "work-order:output:wo-1"]);
  });
});
