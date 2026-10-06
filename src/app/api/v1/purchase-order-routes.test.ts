import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the purchase order list and detail: authentication,
 * permission, tenant scoping and response shape, with the database and
 * session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  purchaseOrder: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
  purchaseOrderLine: { fields: { orderedQty: "orderedQty" } },
}));
const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listPOs } from "./purchase-orders/route";
import { GET as getPO } from "./purchase-orders/[id]/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";

const actor = (permissions: string[]) => ({
  userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Buyer",
  sessionId: "session-1", roles: ["PROCUREMENT"], permissions: new Set(permissions),
});
const request = (path: string, signedIn = true) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, { headers: signedIn ? { cookie: "anvaya.session=token" } : {} });

const po = (over: Record<string, unknown> = {}) => ({
  id: "po-241", companyId: COMPANY, orderNumber: "PO-2026-0241", vendorId: "v3", locationId: "l-pune",
  orderDate: day("2026-03-18"), expectedDeliveryDate: day("2026-04-01"), actualDeliveryDate: null,
  status: "PARTIALLY_RECEIVED", totalAmount: D("87000.0000"), currencyCode: "INR",
  createdById: "u1", approvedById: null, approvedAt: null, notes: null,
  vendor: { id: "v3", code: "SUP-003", name: "Rashtriya Chemicals", isApproved: true },
  location: { id: "l-pune", name: "Pune Plant" },
  lines: [{ orderedQty: D(600), receivedQty: D(250), unitPrice: D(145), lineTotal: D(87000), expectedDeliveryDate: day("2026-04-01") }],
  goodsReceipts: [{ receiptDate: day("2026-03-24") }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(["purchase-order:read"]));
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /purchase-orders", (s: boolean) => listPOs(request("/purchase-orders", s))],
    ["GET /purchase-orders/:id", (s: boolean) => getPO(request("/purchase-orders/po-241", s), { params: { id: "po-241" } })],
  ] as const;

  it.each(endpoints)("%s returns 401 without a session", async (_n, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call(false)).status).toBe(401);
  });

  it.each(endpoints)("%s returns 403 without purchase-order:read", async (_n, call) => {
    session.resolveSession.mockResolvedValue(actor(["work-order:read"]));
    const res = await call(true);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("purchase-order:read");
  });
});

describe("GET /api/v1/purchase-orders", () => {
  it("lists POs with received %, overdue, delivered date and counts", async () => {
    db.purchaseOrder.groupBy.mockResolvedValue([{ status: "PARTIALLY_RECEIVED", _count: { _all: 1 } }, { status: "FULLY_RECEIVED", _count: { _all: 1 } }]);
    db.purchaseOrder.findMany.mockResolvedValue([
      po(),
      po({ id: "po-198", orderNumber: "PO-2026-0198", status: "FULLY_RECEIVED", totalAmount: D(222000),
        lines: [{ orderedQty: D(1200), receivedQty: D(1200), unitPrice: D(185), lineTotal: D(222000), expectedDeliveryDate: day("2026-02-15") }],
        goodsReceipts: [{ receiptDate: day("2026-02-15") }] }),
    ]);

    const body = await (await listPOs(request("/purchase-orders"))).json();

    // Counts and "overdue" across the company are SQL, proven against Postgres
    // in list-pagination.integration.test.ts; the per-row overdue flag is here.
    expect(db.purchaseOrder.findMany.mock.calls[0][0]).toMatchObject({ where: { companyId: COMPANY }, take: 51 });
    for (const call of [...db.purchaseOrder.count.mock.calls, ...db.purchaseOrder.groupBy.mock.calls]) {
      expect(call[0].where).toMatchObject({ companyId: COMPANY });
    }
    expect(body.data.counts).toMatchObject({ all: 2, PARTIALLY_RECEIVED: 1, FULLY_RECEIVED: 1, DRAFT: 0 });
    expect(body.meta).toMatchObject({ nextCursor: null, limit: 50 });
    expect(body.data.orders[0]).toMatchObject({
      orderNumber: "PO-2026-0241", vendor: { name: "Rashtriya Chemicals" }, totalAmount: 87000, lineCount: 1,
      receivedPct: 41.7, overdue: true, delivered: { date: "2026-03-24", source: "RECEIPT" }, totalMismatch: false,
      orderDate: "2026-03-18", expectedDeliveryDate: "2026-04-01",
    });
    expect(body.data.orders[1]).toMatchObject({ receivedPct: 100, overdue: false });
  });

  it("flags a stored total that disagrees with its lines", async () => {
    db.purchaseOrder.findMany.mockResolvedValue([po({ totalAmount: D(90000) })]);
    const body = await (await listPOs(request("/purchase-orders"))).json();
    expect(body.data.orders[0].totalMismatch).toBe(true);
  });
});

describe("GET /api/v1/purchase-orders/:id", () => {
  const detail = (over: Record<string, unknown> = {}) => po({
    createdBy: { name: "Priya Sharma", email: "procurement@anvaya.in" },
    approvedBy: null,
    lines: [{
      lineNumber: 1, orderedQty: D(600), receivedQty: D(250), unitPrice: D(145), lineTotal: D(87000), expectedDeliveryDate: day("2026-04-01"),
      material: { id: "m", code: "RM-2087", name: "Stearic Acid", unitOfMeasure: { code: "KG" } },
    }],
    goodsReceipts: [{
      id: "g1", grnNumber: "GRN-2026-0388", receiptDate: day("2026-03-24"), location: { name: "Pune Plant" },
      lines: [{ receivedQty: D(250), inspectionStatus: "APPROVED", purchaseOrderLine: { lineNumber: 1 },
        material: { code: "RM-2087", unitOfMeasure: { code: "KG" } }, lot: { lotNumber: "RMB-2026-0453" } }],
    }],
    ...over,
  });

  it("returns lines, receipts and people, leaving a missing approver null", async () => {
    db.purchaseOrder.findFirst.mockResolvedValue(detail());
    const body = await (await getPO(request("/purchase-orders/po-241"), { params: { id: "po-241" } })).json();

    expect(db.purchaseOrder.findFirst.mock.calls[0][0].where).toEqual({ id: "po-241", companyId: COMPANY });
    expect(body.data).toMatchObject({ createdBy: { name: "Priya Sharma" }, approvedBy: null, approvedAt: null });
    expect(body.data.lines[0]).toMatchObject({ orderedQty: 600, receivedQty: 250, outstandingQty: 350, uom: "KG", overdue: true });
    expect(body.data.receipts[0]).toMatchObject({
      grnNumber: "GRN-2026-0388", receiptDate: "2026-03-24",
      lines: [{ lineNumber: 1, receivedQty: 250, lotNumber: "RMB-2026-0453", inspectionStatus: "APPROVED" }],
    });
  });

  it("never marks a line overdue on a finished PO", async () => {
    db.purchaseOrder.findFirst.mockResolvedValue(detail({ status: "CANCELLED" }));
    const body = await (await getPO(request("/purchase-orders/po-241"), { params: { id: "po-241" } })).json();
    expect(body.data.lines[0].overdue).toBe(false);
    expect(body.data.overdue).toBe(false);
  });

  it("returns 404 for another company's PO", async () => {
    db.purchaseOrder.findFirst.mockResolvedValue(null);
    expect((await getPO(request("/purchase-orders/x"), { params: { id: "x" } })).status).toBe(404);
  });
});
