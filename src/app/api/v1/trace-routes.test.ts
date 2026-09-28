import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

/**
 * Route-level tests for the lot register, lot trace, indicators and the
 * GRN and vendor lookups (sales orders are in sales-order-routes.test.ts):
 * authentication, permission, tenant scoping and response shape, through the
 * real withApi() wrapper with the database and session mocked.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({
  inventoryLot: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  workOrder: { findMany: vi.fn(), findFirst: vi.fn() },
  workOrderComponent: { findMany: vi.fn() },
  stockMovement: { findMany: vi.fn() },
  salesOrderLine: { findMany: vi.fn() },
  goodsReceipt: { findFirst: vi.fn() },
  vendor: { findFirst: vi.fn() },
}));

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: db }));
vi.mock("@/server/auth/session", () => ({
  SESSION_COOKIE: "anvaya.session",
  resolveSession: session.resolveSession,
  touchSession: vi.fn(),
}));

import { GET as listLots } from "./inventory/lots/route";
import { GET as getLot } from "./inventory/lots/[id]/route";
import { GET as getIndicators } from "./inventory/lots/indicators/route";
import { GET as getGrn } from "./goods-receipts/[grnNumber]/route";
import { GET as getVendor } from "./vendors/[id]/route";

const D = (v: string | number) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const COMPANY = "company-1";
const ALL = ["inventory:read", "purchase-order:read", "vendor:read", "sales-order:read"];

function actor(permissions: string[]) {
  return {
    userId: "user-1", companyId: COMPANY, email: "p@anvaya.in", name: "Planner",
    sessionId: "session-1", roles: ["PLANNER"], permissions: new Set(permissions),
  };
}

function request(path: string, signedIn = true) {
  return new NextRequest(`http://localhost:8080/api/v1${path}`, {
    headers: signedIn ? { cookie: "anvaya.session=token" } : {},
  });
}

const vendorRow = { id: "v1", code: "SUP-001", name: "Galaxy Surfactants", isApproved: true };

const receiptLine = {
  coaReference: "COA-GS-88421", inspectionStatus: "APPROVED", inspectionDate: day("2026-02-15"), inspectorName: "S. Iyer",
  goodsReceipt: { id: "g1", grnNumber: "GRN-2026-0312", receiptDate: day("2026-02-15"), purchaseOrder: { orderNumber: "PO-2026-0198" } },
};

function lotRow(over: Record<string, unknown> = {}) {
  return {
    id: "lot-rm", lotNumber: "RMB-2026-0451", materialId: "m-rm", locationId: "l1", vendorId: "v1",
    supplierLotNumber: "GS-SLS-88421", receivedQty: D("1200"), consumedQty: D("350"), remainingQty: D("850"),
    receiptDate: day("2026-02-15"), expiryDate: day("2028-02-15"), qcStatus: "APPROVED", coaReference: "COA-GS-88421",
    releaseDate: null, releasedBy: null, storageLocation: "Chemical Store A", bin: "A-12",
    createdAt: day("2026-02-15"), updatedAt: day("2026-02-15"),
    material: { id: "m-rm", code: "RM-4023", name: "Sodium Lauryl Sulphate", kind: "RAW", standardCost: D("185.0000"), unitOfMeasure: { code: "KG" } },
    location: { id: "l1", code: "PUNE", name: "Pune Plant" },
    vendor: vendorRow,
    grnLines: [receiptLine],
    movements: [],
    ...over,
  };
}

const fgLot = () => lotRow({
  id: "lot-fg", lotNumber: "FGB-2026-0091", materialId: "m-fg", vendorId: null, vendor: null,
  supplierLotNumber: null, coaReference: null, grnLines: [],
  receivedQty: D("500"), consumedQty: D("240"), remainingQty: D("260"),
  receiptDate: day("2026-03-14"), expiryDate: day("2028-03-13"),
  material: { id: "m-fg", code: "FG-001", name: "Industrial Cleaning Compound 5L", kind: "FINISHED", standardCost: D("690"), unitOfMeasure: { code: "UNIT" } },
  movements: [{ referenceId: "wo-91" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  session.resolveSession.mockResolvedValue(actor(ALL));
});

describe("authentication and permission", () => {
  const endpoints = [
    ["GET /inventory/lots", (s: boolean) => listLots(request("/inventory/lots", s)), "inventory:read"],
    ["GET /inventory/lots/:id", (s: boolean) => getLot(request("/inventory/lots/x", s), { params: { id: "x" } }), "inventory:read"],
    ["GET /inventory/lots/indicators", (s: boolean) => getIndicators(request("/inventory/lots/indicators", s)), "inventory:read"],
    ["GET /goods-receipts/:grnNumber", (s: boolean) => getGrn(request("/goods-receipts/GRN-2026-0312", s), { params: { grnNumber: "GRN-2026-0312" } }), "purchase-order:read"],
    ["GET /vendors/:id", (s: boolean) => getVendor(request("/vendors/v1", s), { params: { id: "v1" } }), "vendor:read"],
  ] as const;

  it.each(endpoints)("%s returns 401 without a session", async (_n, call) => {
    session.resolveSession.mockResolvedValue(null);
    expect((await call(false)).status).toBe(401);
  });

  it.each(endpoints)("%s returns 403 without %s", async (_n, call, permission) => {
    session.resolveSession.mockResolvedValue(actor(ALL.filter((p) => p !== permission)));
    const res = await call(true);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });
});

describe("GET /api/v1/inventory/lots", () => {
  it("lists lots with numbers, source, receipt CoA, value and age", async () => {
    db.inventoryLot.findMany.mockResolvedValue([lotRow()]);
    db.inventoryLot.count.mockResolvedValue(1);

    const body = await (await listLots(request("/inventory/lots"))).json();

    expect(body.data[0]).toMatchObject({
      lotNumber: "RMB-2026-0451", source: "PURCHASED", qcStatus: "APPROVED",
      receivedQty: 1200, remainingQty: 850, uom: "KG",
      receiptDate: "2026-02-15", expiryDate: "2028-02-15",
      coaReference: "COA-GS-88421", value: 157250,
      vendor: vendorRow, workOrder: null, inputCount: null,
    });
    expect(typeof body.data[0].ageDays).toBe("number");
    expect(body.meta).toEqual({ nextCursor: null, limit: 100, total: 1 });
    // No producing work order to look up for a purchased lot.
    expect(db.workOrder.findMany).not.toHaveBeenCalled();
  });

  it("scopes through the material's company and searches the documented fields", async () => {
    db.inventoryLot.findMany.mockResolvedValue([]);
    db.inventoryLot.count.mockResolvedValue(0);

    await listLots(request("/inventory/lots?q=galaxy&qcStatus=QUARANTINE&kind=RAW"));

    const where = db.inventoryLot.findMany.mock.calls[0][0].where;
    expect(where.material).toEqual({ companyId: COMPANY, kind: "RAW" });
    expect(where.qcStatus).toBe("QUARANTINE");
    expect(where.OR).toHaveLength(6);
    expect(where.OR).toContainEqual({ vendor: { name: { contains: "galaxy", mode: "insensitive" } } });
  });

  it("marks a lot produced by a work order, with its BOM revision and input count", async () => {
    db.inventoryLot.findMany.mockResolvedValue([fgLot()]);
    db.inventoryLot.count.mockResolvedValue(1);
    db.workOrder.findMany.mockResolvedValue([{
      id: "wo-91", orderNumber: "WO-2026-0091",
      bomVersion: { version: "A", bom: { code: "BOM-FG-001", name: "FG-001 formula" } },
      _count: { components: 6 },
    }]);

    const body = await (await listLots(request("/inventory/lots"))).json();

    expect(body.data[0]).toMatchObject({
      source: "PRODUCED", inputCount: 6, vendor: null,
      workOrder: { orderNumber: "WO-2026-0091", bomCode: "BOM-FG-001", bomVersion: "A" },
    });
    expect(db.workOrder.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["wo-91"] }, companyId: COMPANY });
  });

  it("returns 422 for an unknown QC status", async () => {
    const res = await listLots(request("/inventory/lots?qcStatus=FAILED"));
    expect(res.status).toBe(422);
    expect(db.inventoryLot.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/inventory/lots/:id", () => {
  it("returns 404 for a missing or other-company lot", async () => {
    db.inventoryLot.findFirst.mockResolvedValue(null);
    const res = await getLot(request("/inventory/lots/elsewhere"), { params: { id: "elsewhere" } });
    expect(res.status).toBe(404);
    expect(db.inventoryLot.findFirst.mock.calls[0][0].where).toEqual({ id: "elsewhere", material: { companyId: COMPANY } });
  });

  it("traces a purchased lot back to its receipt, PO and vendor", async () => {
    db.inventoryLot.findFirst.mockResolvedValue(lotRow());
    db.stockMovement.findMany.mockResolvedValue([]);
    db.workOrderComponent.findMany.mockResolvedValue([]);

    const body = await (await getLot(request("/inventory/lots/lot-rm"), { params: { id: "lot-rm" } })).json();

    expect(body.data.production).toBeNull();
    expect(body.data.receipt).toEqual({
      goodsReceiptId: "g1", grnNumber: "GRN-2026-0312", receiptDate: "2026-02-15",
      purchaseOrderNumber: "PO-2026-0198", coaReference: "COA-GS-88421",
      inspectionStatus: "APPROVED", inspectionDate: "2026-02-15", inspectorName: "S. Iyer",
    });
    expect(body.data.dispatches).toEqual([]);
    expect(db.workOrder.findFirst).not.toHaveBeenCalled();
  });

  it("traces a produced lot back through its work order inputs and forward to customers", async () => {
    db.inventoryLot.findFirst.mockResolvedValue(fgLot());
    db.workOrder.findFirst.mockResolvedValue({
      id: "wo-91", orderNumber: "WO-2026-0091", status: "COMPLETED", producedQty: D("500"),
      bomVersion: { version: "A", bom: { code: "BOM-FG-001", name: "FG-001 formula" } },
      _count: { components: 2 },
      components: [
        {
          requiredQty: D("25.25"), issuedQty: D("0"),
          material: { id: "m-f", code: "RM-8012", name: "Fragrance Blend FG-04", kind: "RAW", unitOfMeasure: { code: "L" } },
          lot: {
            id: "lot-f", lotNumber: "RMB-2026-0461", qcStatus: "QUARANTINE", supplierLotNumber: "GI-FR04-9912",
            coaReference: "COA-GI-9912", storageLocation: "Fragrance Vault", bin: "F-02",
            vendor: { id: "v8", code: "SUP-008", name: "Givaudan", isApproved: false }, grnLines: [],
          },
        },
        {
          requiredQty: D("505"), issuedQty: D("0"),
          material: { id: "m-c", code: "PM-2003", name: "Foil Seals 5L", kind: "PACKAGING", unitOfMeasure: { code: "PCS" } },
          lot: null,
        },
      ],
    });
    db.stockMovement.findMany.mockResolvedValue([{ referenceId: "sol-1", quantity: D("-240"), occurredAt: day("2026-03-24") }]);
    db.workOrderComponent.findMany.mockResolvedValue([]);
    db.salesOrderLine.findMany.mockResolvedValue([{
      id: "sol-1",
      salesOrder: { id: "so-1", orderNumber: "SO-4521", invoiceNumber: "INV-2026-1187", deliveryStatus: "DELIVERED", customer: { name: "Reliance Retail" } },
    }]);

    const body = await (await getLot(request("/inventory/lots/lot-fg"), { params: { id: "lot-fg" } })).json();
    const { production, dispatches } = body.data;

    expect(db.workOrder.findFirst.mock.calls[0][0].where).toEqual({ id: "wo-91", companyId: COMPANY });
    expect(production).toMatchObject({ orderNumber: "WO-2026-0091", producedQty: 500, bom: { code: "BOM-FG-001", version: "A" } });
    expect(production.inputs[0]).toMatchObject({
      requiredQty: 25.25, suspect: true, nonApprovedVendor: true,
      lot: { lotNumber: "RMB-2026-0461", receipt: null, vendor: { isApproved: false } },
    });
    expect(production.inputs[1]).toMatchObject({ lot: null, suspect: false, nonApprovedVendor: false });
    expect(dispatches).toEqual([{
      salesOrderId: "so-1", orderNumber: "SO-4521", customer: "Reliance Retail", quantity: 240,
      invoiceNumber: "INV-2026-1187", deliveryStatus: "DELIVERED", dispatchedAt: "2026-03-24",
    }]);
    expect(db.salesOrderLine.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["sol-1"] }, salesOrder: { companyId: COMPANY } });
  });
});

describe("GET /api/v1/inventory/lots/indicators", () => {
  it("computes completeness, containment and expiry from the company's lots", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000);
    db.inventoryLot.findMany.mockResolvedValue([
      {
        id: "a", lotNumber: "A", qcStatus: "APPROVED", consumedQty: D(100), remainingQty: D(20), expiryDate: soon,
        material: { name: "Stearic Acid", standardCost: D(145), unitOfMeasure: { code: "KG" } },
        grnLines: [{ coaReference: "COA-1" }], movements: [], consumedBy: [],
      },
      {
        id: "b", lotNumber: "B", qcStatus: "QUARANTINE", consumedQty: D(0), remainingQty: D(440), expiryDate: null,
        material: { name: "Titanium Dioxide", standardCost: D(320), unitOfMeasure: { code: "KG" } },
        grnLines: [], movements: [], consumedBy: [],
      },
    ]);

    const body = await (await getIndicators(request("/inventory/lots/indicators"))).json();

    expect(db.inventoryLot.findMany.mock.calls[0][0].where).toEqual({ material: { companyId: COMPANY } });
    expect(body.data).toMatchObject({
      backwardPct: 50, forwardPct: 0, lotCount: 2, forwardEligible: 1,
      containmentLots: 1, expiryWindowDays: 30,
    });
    expect(body.data.expiring).toHaveLength(1);
    expect(body.data.expiring[0]).toMatchObject({ lotNumber: "A", remainingQty: 20, value: 2900 });
  });
});

describe("GET /api/v1/goods-receipts/:grnNumber", () => {
  it("normalises the number and scopes the lookup to the company", async () => {
    db.goodsReceipt.findFirst.mockResolvedValue(null);
    const res = await getGrn(request("/goods-receipts/grn-2026-0312"), { params: { grnNumber: "grn-2026-0312" } });
    expect(res.status).toBe(404);
    expect(db.goodsReceipt.findFirst.mock.calls[0][0].where).toEqual({ companyId: COMPANY, grnNumber: "GRN-2026-0312" });
  });

  it("returns 422 for something that is not a GRN number", async () => {
    const res = await getGrn(request("/goods-receipts/nonsense"), { params: { grnNumber: "nonsense" } });
    expect(res.status).toBe(422);
    expect(db.goodsReceipt.findFirst).not.toHaveBeenCalled();
  });

  it("returns lines with converted quantities and the lots they created", async () => {
    db.goodsReceipt.findFirst.mockResolvedValue({
      id: "g1", grnNumber: "GRN-2026-0312", receiptDate: day("2026-02-15"),
      purchaseOrder: { id: "po1", orderNumber: "PO-2026-0198", status: "FULLY_RECEIVED", totalAmount: D("222000.0000") },
      vendor: vendorRow, location: { id: "l1", code: "PUNE", name: "Pune Plant" },
      lines: [{
        lineNumber: 1, lotId: "lot-rm", receivedQty: D("1200.000000"), rejectedQty: D("0"),
        supplierLotNumber: "GS-SLS-88421", coaReference: "COA-GS-88421", inspectionStatus: "APPROVED",
        inspectionDate: day("2026-02-15"), inspectorName: "S. Iyer", storageLocation: null, bin: null,
        material: { id: "m-rm", code: "RM-4023", name: "Sodium Lauryl Sulphate", kind: "RAW", unitOfMeasure: { code: "KG" } },
        lot: { id: "lot-rm", lotNumber: "RMB-2026-0451" },
      }],
    });
    db.workOrderComponent.findMany.mockResolvedValue([]);

    const body = await (await getGrn(request("/goods-receipts/GRN-2026-0312"), { params: { grnNumber: "GRN-2026-0312" } })).json();

    expect(body.data.purchaseOrder.totalAmount).toBe(222000);
    expect(body.data.lines[0]).toMatchObject({ receivedQty: 1200, uom: "KG", lot: { lotNumber: "RMB-2026-0451" } });
    expect(body.data.producedLots).toEqual([]);
    expect(db.workOrderComponent.findMany.mock.calls[0][0].where).toEqual({ lotId: { in: ["lot-rm"] }, workOrder: { companyId: COMPANY } });
  });
});

describe("GET /api/v1/vendors/:id", () => {
  it("returns approval, supplied materials and the latest scorecard", async () => {
    db.vendor.findFirst.mockResolvedValue({
      ...vendorRow, vendorCode: "VEN-GS-001", city: "Navi Mumbai", state: "Maharashtra",
      contactPerson: "R. Shah", contactEmail: null, paymentTerms: "Net 30", isActive: true,
      materials: [{ isPreferred: true, material: { code: "RM-4023", name: "Sodium Lauryl Sulphate" } }],
      scorecards: [{
        periodStart: day("2026-01-01"), periodEnd: day("2026-03-31"),
        defectRatePercent: D("2.1000"), onTimeDeliveryPercent: D("88.0000"), copqAmount: D("420000"),
        lastAuditDate: day("2025-11-15"), auditResult: "CONDITIONAL",
      }],
    });

    const body = await (await getVendor(request("/vendors/v1"), { params: { id: "v1" } })).json();

    expect(db.vendor.findFirst.mock.calls[0][0].where).toEqual({ id: "v1", companyId: COMPANY });
    expect(body.data).toMatchObject({
      isApproved: true,
      approvedMaterials: [{ code: "RM-4023", isPreferred: true }],
      scorecard: { defectRatePercent: 2.1, onTimeDeliveryPercent: 88, copqAmount: 420000, auditResult: "CONDITIONAL" },
    });
  });

  it("returns null scorecard when none is recorded, and 404 for another company's vendor", async () => {
    db.vendor.findFirst.mockResolvedValueOnce({ ...vendorRow, vendorCode: null, city: null, state: null, contactPerson: null, contactEmail: null, paymentTerms: null, isActive: true, materials: [], scorecards: [] });
    expect((await (await getVendor(request("/vendors/v1"), { params: { id: "v1" } })).json()).data.scorecard).toBeNull();

    db.vendor.findFirst.mockResolvedValueOnce(null);
    expect((await getVendor(request("/vendors/other"), { params: { id: "other" } })).status).toBe(404);
  });
});
