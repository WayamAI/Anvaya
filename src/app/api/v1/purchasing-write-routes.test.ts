import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level tests for the purchasing write endpoints: authentication,
 * permission, body validation, CSRF origin check and idempotent replay, with
 * the services mocked. The services themselves are proven against Postgres
 * in purchasing.integration.test.ts.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const writes = vi.hoisted(() => ({
  createPurchaseOrder: vi.fn(), updatePurchaseOrder: vi.fn(), deletePurchaseOrder: vi.fn(),
  approvePurchaseOrder: vi.fn(), sendPurchaseOrder: vi.fn(), cancelPurchaseOrder: vi.fn(),
}));
const reads = vi.hoisted(() => ({ getPurchaseOrder: vi.fn(), listPurchaseOrders: vi.fn() }));
const grn = vi.hoisted(() => ({ receiveGoods: vi.fn() }));
const idem = vi.hoisted(() => ({ runIdempotent: vi.fn() }));
const qc = vi.hoisted(() => ({ decideLotQuality: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session", resolveSession: session.resolveSession, touchSession: vi.fn(),
}));
vi.mock("@/server/services/purchase-order-write.service", () => writes);
vi.mock("@/server/services/purchase-order.service", () => reads);
vi.mock("@/server/services/goods-receipt.service", () => grn);
vi.mock("@/server/services/lot-quality.service", () => qc);
vi.mock("@/server/api/idempotency", async (orig) => ({
  ...(await orig<typeof import("@/server/api/idempotency")>()),
  runIdempotent: idem.runIdempotent,
}));

import { POST as createPO } from "./purchase-orders/route";
import { PATCH as patchPO, DELETE as deletePO } from "./purchase-orders/[id]/route";
import { POST as approvePO } from "./purchase-orders/[id]/approve/route";
import { POST as cancelPO } from "./purchase-orders/[id]/cancel/route";
import { POST as receive } from "./goods-receipts/route";
import { POST as lotQc } from "./inventory/lots/[id]/qc/route";

const actor = (permissions: string[]) => ({
  userId: "u1", companyId: "c1", email: "b@anvaya.in", name: "Buyer", sessionId: "s1", roles: ["PROCUREMENT"],
  permissions: new Set(permissions),
});

function request(path: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method,
    headers: { cookie: "anvaya.session=t", "content-type": "application/json", host: "localhost:8080", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validPO = { vendorId: "v", locationId: "l", expectedDeliveryDate: "2026-10-10", lines: [{ materialId: "m", orderedQty: 5 }] };
const validGRN = { purchaseOrderId: "po", lines: [{ purchaseOrderLineId: "pl", receivedQty: 5 }] };
const idParams = { params: { id: "po-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor([
    "purchase-order:create", "purchase-order:update", "purchase-order:delete", "purchase-order:approve",
    "goods-receipt:create", "inventory:update",
  ]));
  reads.getPurchaseOrder.mockResolvedValue({ id: "po-1", orderNumber: "PO-2026-0001" });
  writes.createPurchaseOrder.mockResolvedValue({ id: "po-1", orderNumber: "PO-2026-0001" });
});

describe("permissions", () => {
  const cases = [
    ["POST /purchase-orders", "purchase-order:create", () => createPO(request("/purchase-orders", "POST", validPO))],
    ["PATCH /purchase-orders/:id", "purchase-order:update", () => patchPO(request("/purchase-orders/po-1", "PATCH", { notes: "x" }), idParams)],
    ["DELETE /purchase-orders/:id", "purchase-order:delete", () => deletePO(request("/purchase-orders/po-1", "DELETE"), idParams)],
    ["POST /purchase-orders/:id/approve", "purchase-order:approve", () => approvePO(request("/purchase-orders/po-1/approve", "POST"), idParams)],
    ["POST /goods-receipts", "goods-receipt:create", () => receive(request("/goods-receipts", "POST", validGRN))],
    ["POST /inventory/lots/:id/qc", "inventory:update", () => lotQc(request("/inventory/lots/l/qc", "POST", { status: "APPROVED" }), { params: { id: "l" } })],
  ] as const;

  it.each(cases)("%s needs a session", async (_n, _p, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["purchase-order:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });
});

describe("purchase order routes", () => {
  it("creates with 201, a Location header and the full PO", async () => {
    const res = await createPO(request("/purchase-orders", "POST", validPO));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/api/v1/purchase-orders/po-1");
    expect((await res.json()).data.orderNumber).toBe("PO-2026-0001");
    expect(writes.createPurchaseOrder.mock.calls[0][1].actor.userId).toBe("u1");
  });

  it("rejects malformed JSON and invalid bodies with field details, before any service call", async () => {
    expect((await createPO(request("/purchase-orders", "POST", "{not json"))).status).toBe(422);
    const res = await createPO(request("/purchase-orders", "POST", { ...validPO, lines: [] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toEqual([{ path: "lines", message: "a purchase order needs at least one line" }]);
    expect(writes.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("requires a reason to cancel", async () => {
    expect((await cancelPO(request("/purchase-orders/po-1/cancel", "POST", {}), idParams)).status).toBe(422);
    expect((await cancelPO(request("/purchase-orders/po-1/cancel", "POST", { reason: "Vendor closed" }), idParams)).status).toBe(200);
  });

  it("deletes with 204", async () => {
    expect((await deletePO(request("/purchase-orders/po-1", "DELETE"), idParams)).status).toBe(204);
  });
});

describe("cross-site requests", () => {
  it("refuses a write whose Origin is another site", async () => {
    const res = await createPO(request("/purchase-orders", "POST", validPO, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(writes.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("accepts the app's own origin", async () => {
    expect((await createPO(request("/purchase-orders", "POST", validPO, { origin: "http://localhost:8080" }))).status).toBe(201);
  });
});

describe("POST /goods-receipts", () => {
  const body = { id: "g1", grnNumber: "GRN-2026-0001" };

  it("passes the Idempotency-Key and body hash through, and flags a replay", async () => {
    idem.runIdempotent.mockResolvedValue({ status: 201, body, replayed: true });
    const res = await receive(request("/goods-receipts", "POST", validGRN, { "idempotency-key": "abc-123" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("idempotent-replayed")).toBe("true");
    expect(res.headers.get("location")).toBe("/api/v1/goods-receipts/GRN-2026-0001");
    expect(idem.runIdempotent.mock.calls[0][0]).toMatchObject({ key: "abc-123", scope: "goods-receipt:create", companyId: "c1" });
    expect(idem.runIdempotent.mock.calls[0][0].requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("runs without idempotency when no key is sent", async () => {
    idem.runIdempotent.mockResolvedValue({ status: 201, body, replayed: false });
    const res = await receive(request("/goods-receipts", "POST", validGRN));
    expect(idem.runIdempotent.mock.calls[0][0]).toBeNull();
    expect(res.headers.get("idempotent-replayed")).toBeNull();
  });

  it("rejects a malformed key", async () => {
    const res = await receive(request("/goods-receipts", "POST", validGRN, { "idempotency-key": "has spaces in it" }));
    expect(res.status).toBe(422);
  });
});
