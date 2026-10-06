import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import { runIdempotent, hashBody } from "@/server/api/idempotency";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import {
  approvePurchaseOrder, cancelPurchaseOrder, createPurchaseOrder, deletePurchaseOrder, sendPurchaseOrder, updatePurchaseOrder,
} from "./purchase-order-write.service";
import { receiveGoods } from "./goods-receipt.service";
import { decideLotQuality } from "./lot-quality.service";
import type { CreateGoodsReceiptInput } from "@/server/validation/purchasing";

/**
 * PO → goods receipt → lots → quality, end to end against Postgres.
 */

let f: Fixture;
let buyer: Awaited<ReturnType<Fixture["actor"]>>;
let approver: Awaited<ReturnType<Fixture["actor"]>>;
let storekeeper: Awaited<ReturnType<Fixture["actor"]>>;

const ALL_PO = ["purchase-order:create", "purchase-order:update", "purchase-order:delete", "purchase-order:read"];

beforeAll(async () => {
  f = await createFixture();
  buyer = await f.actor(ALL_PO, "Buyer");
  approver = await f.actor(["purchase-order:approve"], "Approver");
  storekeeper = await f.actor(["goods-receipt:create", "inventory:update", "quality:decide"], "Storekeeper");
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

async function openPo(lines = [{ materialId: "raw", orderedQty: 100 }, { materialId: "pack", orderedQty: 500 }]) {
  const ids: Record<string, string> = { raw: f.raw.id, pack: f.pack.id };
  const po = await createPurchaseOrder({
    vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01",
    lines: lines.map((l) => ({ ...l, materialId: ids[l.materialId] })),
  }, f.ctx(buyer));
  await approvePurchaseOrder(po.id, f.ctx(approver));
  const poLines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id }, orderBy: { lineNumber: "asc" } });
  return { ...po, lines: poLines };
}

const receive = (input: CreateGoodsReceiptInput, who = storekeeper) =>
  runInTransaction((tx) => receiveGoods(tx, input, f.ctx(who)));

describe("purchase orders", () => {
  it("raises a DRAFT with vendor prices, a Decimal total and the next number in the series", async () => {
    const year = new Date().getFullYear();
    // A register that already exists continues rather than colliding.
    await prisma.purchaseOrder.create({
      data: {
        companyId: f.companyId, orderNumber: `PO-${year}-0041`, vendorId: f.vendor.id, locationId: f.plant.id,
        orderDate: new Date(`${year}-01-02T00:00:00Z`), expectedDeliveryDate: new Date(`${year}-01-09T00:00:00Z`),
        createdById: buyer.userId, status: "CANCELLED",
      },
    });

    const po = await createPurchaseOrder({
      vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01",
      lines: [{ materialId: f.raw.id, orderedQty: 100 }, { materialId: f.pack.id, orderedQty: 3, unitPrice: 0.1 }],
    }, f.ctx(buyer));

    expect(po.orderNumber).toBe(`PO-${year}-0042`);
    const row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: { orderBy: { lineNumber: "asc" } } } });
    expect(row.status).toBe("DRAFT");
    expect(row.lines.map((l) => [l.unitPrice.toNumber(), l.lineTotal.toNumber()])).toEqual([[12, 1200], [0.1, 0.3]]);
    expect(row.totalAmount.toString()).toBe("1200.3");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: po.id, action: "CREATE" } });
    expect(audit).toMatchObject({ userId: buyer.userId, entityLabel: po.orderNumber, entityType: "purchase_orders" });
  });

  it("refuses a line with no price on file and none given, naming the line", async () => {
    const e = await failure(createPurchaseOrder({
      vendorId: f.unapprovedVendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01",
      lines: [{ materialId: f.pack.id, orderedQty: 1 }],
    }, f.ctx(buyer)));
    expect(e.status).toBe(422);
    expect(e.details).toEqual([{ path: "lines.0.unitPrice", message: "no price on file for PM-T1 from this vendor; enter one" }]);
  });

  it("does not see another company's vendor or material", async () => {
    const other = await createFixture();
    try {
      const e = await failure(createPurchaseOrder({
        vendorId: other.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01",
        lines: [{ materialId: f.raw.id, orderedQty: 1 }],
      }, f.ctx(buyer)));
      expect(e.details).toEqual([{ path: "vendorId", message: "not found" }]);

      const po = await createPurchaseOrder({
        vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01", lines: [{ materialId: f.raw.id, orderedQty: 1 }],
      }, f.ctx(buyer));
      const outsider = await other.actor(["purchase-order:approve"]);
      expect((await failure(approvePurchaseOrder(po.id, other.ctx(outsider)))).status).toBe(404);
    } finally {
      await other.destroy();
    }
  });

  it("edits only while DRAFT, replacing lines and recomputing the total", async () => {
    const po = await createPurchaseOrder({
      vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01", lines: [{ materialId: f.raw.id, orderedQty: 1 }],
    }, f.ctx(buyer));
    await updatePurchaseOrder(po.id, { lines: [{ materialId: f.raw.id, orderedQty: 10, unitPrice: 11.5 }], notes: "urgent" }, f.ctx(buyer));
    const row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
    expect(row.totalAmount.toNumber()).toBe(115);
    expect(row.lines).toHaveLength(1);
    expect(row.notes).toBe("urgent");

    await approvePurchaseOrder(po.id, f.ctx(approver));
    const e = await failure(updatePurchaseOrder(po.id, { notes: "late change" }, f.ctx(buyer)));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/is APPROVED and cannot be edited/);
    expect((await failure(deletePurchaseOrder(po.id, f.ctx(buyer)))).status).toBe(409);
  });

  it("will not approve to a vendor off the Approved Supplier List", async () => {
    const po = await createPurchaseOrder({
      vendorId: f.unapprovedVendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01",
      lines: [{ materialId: f.raw.id, orderedQty: 5 }],
    }, f.ctx(buyer));
    const e = await failure(approvePurchaseOrder(po.id, f.ctx(approver)));
    expect(e.message).toMatch(/not on the Approved Supplier List/);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status).toBe("DRAFT");
  });

  it("enforces permissions in the service, not just the route", async () => {
    const po = await createPurchaseOrder({
      vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01", lines: [{ materialId: f.raw.id, orderedQty: 1 }],
    }, f.ctx(buyer));
    expect((await failure(approvePurchaseOrder(po.id, f.ctx(buyer)))).status).toBe(403);
  });

  it("honours a company policy against self-approval", async () => {
    await prisma.companySetting.create({ data: { companyId: f.companyId, namespace: "purchasing", key: "allowSelfApproval", value: false } });
    try {
      const both = await f.actor([...ALL_PO, "purchase-order:approve"], "BuyerApprover");
      const po = await createPurchaseOrder({
        vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01", lines: [{ materialId: f.raw.id, orderedQty: 1 }],
      }, f.ctx(both));
      expect((await failure(approvePurchaseOrder(po.id, f.ctx(both)))).message).toMatch(/requires another approver/);
      await approvePurchaseOrder(po.id, f.ctx(approver));
    } finally {
      await prisma.companySetting.deleteMany({ where: { companyId: f.companyId } });
    }
  });
});

describe("goods receipt", () => {
  it("receives a partial delivery: lot, held stock, ledger row, PO progress and audit, in one commit", async () => {
    const po = await openPo();
    await sendPurchaseOrder(po.id, f.ctx(buyer));
    const before = await f.balance(f.raw.id);

    const grn = await receive({
      purchaseOrderId: po.id,
      lines: [
        { purchaseOrderLineId: po.lines[0].id, receivedQty: 60, rejectedQty: 5, supplierLotNumber: "V-LOT-1", coaReference: "COA-1" },
        { purchaseOrderLineId: po.lines[1].id, receivedQty: 500 },
      ],
    });

    expect(grn.grnNumber).toMatch(/^GRN-\d{4}-0001$/);
    expect(grn.purchaseOrder.status).toBe("PARTIALLY_RECEIVED");
    const [rawLine, packLine] = grn.lines;
    expect(rawLine).toMatchObject({ receivedQty: 60, rejectedQty: 5, inspectionStatus: "PENDING" });
    expect(rawLine.lot!.lotNumber).toMatch(/^RMB-\d{4}-0001$/);
    // 365-day shelf life from today's receipt.
    expect(rawLine.lot!.expiryDate).toBe(new Date(Date.parse(grn.receiptDate) + 365 * 86_400_000).toISOString().slice(0, 10));
    expect(packLine).toMatchObject({ receivedQty: 500, inspectionStatus: "APPROVED", lot: null });

    // Held until released: on hand and value up, all of it held.
    expect(await f.balance(f.raw.id)).toEqual({ onHand: before.onHand + 60, held: before.held + 60, value: before.value + 720, reserved: 0 });
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 500, held: 0, value: 1250 });

    const lot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: rawLine.lot!.id } });
    expect(lot).toMatchObject({ qcStatus: "PENDING", vendorId: f.vendor.id, supplierLotNumber: "V-LOT-1", coaReference: "COA-1" });
    expect(lot.remainingQty.toNumber()).toBe(60);

    const moves = await prisma.stockMovement.findMany({ where: { lotId: lot.id } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "RECEIPT", referenceType: "GOODS_RECEIPT_LINE", postedById: storekeeper.userId });
    expect(moves[0].quantity.toNumber()).toBe(60);
    expect(moves[0].balanceAfter.toNumber()).toBe(before.onHand + 60);

    const poAfter = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id }, orderBy: { lineNumber: "asc" } });
    expect(poAfter.map((l) => l.receivedQty.toNumber())).toEqual([60, 500]);

    const audit = await prisma.auditLog.findMany({ where: { companyId: f.companyId, requestId: { not: null }, entityLabel: grn.grnNumber } });
    expect(audit.map((a) => a.action)).toEqual(["RECEIVE"]);
  });

  it("completes the PO on the final receipt and records the delivery date", async () => {
    const po = await openPo([{ materialId: "raw", orderedQty: 10 }]);
    await receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 4, inspectionStatus: "APPROVED" }] });
    const last = await receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 6, inspectionStatus: "APPROVED" }] });
    expect(last.purchaseOrder.status).toBe("FULLY_RECEIVED");
    const row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    expect(row.actualDeliveryDate?.toISOString().slice(0, 10)).toBe(last.receiptDate);
    await expect(receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 1 }] }))
      .rejects.toThrow(/is FULLY_RECEIVED and cannot be received against/);
  });

  it("rolls back entirely when any line is bad — no GRN, no lot, no stock", async () => {
    const po = await openPo();
    const counts = async () => ({
      grns: await prisma.goodsReceipt.count({ where: { companyId: f.companyId } }),
      lots: await prisma.inventoryLot.count({ where: { materialId: f.raw.id } }),
      stock: await f.balance(f.raw.id),
    });
    const before = await counts();
    const e = await failure(receive({
      purchaseOrderId: po.id,
      lines: [
        { purchaseOrderLineId: po.lines[0].id, receivedQty: 50 },
        { purchaseOrderLineId: po.lines[1].id, receivedQty: 501 },
      ],
    }));
    expect(e.details).toEqual([{ path: "lines.1.receivedQty", message: "PM-T1: 501 exceeds the outstanding 500" }]);
    expect(await counts()).toEqual(before);
  });

  it("refuses a DRAFT PO and a future-dated receipt", async () => {
    const draft = await createPurchaseOrder({
      vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: "2099-01-01", lines: [{ materialId: f.raw.id, orderedQty: 1 }],
    }, f.ctx(buyer));
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: draft.id } });
    expect((await failure(receive({ purchaseOrderId: draft.id, lines: [{ purchaseOrderLineId: line.id, receivedQty: 1 }] }))).message)
      .toMatch(/is DRAFT and cannot be received against; it must be APPROVED or ORDERED or PARTIALLY_RECEIVED/);

    const po = await openPo();
    expect((await failure(receive({ purchaseOrderId: po.id, receiptDate: "2099-12-31", lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 1 }] }))).message)
      .toMatch(/future/);
  });

  it("lets exactly one of two concurrent receipts through when together they would over-receive", async () => {
    const po = await openPo([{ materialId: "raw", orderedQty: 100 }]);
    const attempt = () => receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 60 }] });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r): r is PromiseRejectedResult => r.status === "rejected")) {
      expect(r.reason.message).toMatch(/cannot be posted/);
    }
    const line = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0].id } });
    expect(line.receivedQty.toNumber()).toBe(60);
  });

  it("hands out distinct, gap-free numbers under concurrency", async () => {
    const po = await openPo([{ materialId: "pack", orderedQty: 100 }]);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 1 }] })),
    );
    const numbers = results.map((r) => Number(r.grnNumber.slice(-4))).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(5);
    expect(numbers.at(-1)! - numbers[0]).toBe(4);
  });
});

describe("idempotency", () => {
  const run = (key: string, input: CreateGoodsReceiptInput) =>
    runIdempotent(
      { companyId: f.companyId, userId: storekeeper.userId, key, scope: "goods-receipt:create", requestHash: hashBody(input) },
      201,
      (tx) => receiveGoods(tx, input, f.ctx(storekeeper)),
    );

  it("posts a retried receipt once and replays the first response", async () => {
    const po = await openPo([{ materialId: "pack", orderedQty: 100 }]);
    const input = { purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 30 }] };
    const key = randomUUID();

    const first = await run(key, input);
    const again = await run(key, input);
    expect(first.replayed).toBe(false);
    expect(again).toMatchObject({ replayed: true, status: 201 });
    expect(again.body.grnNumber).toBe(first.body.grnNumber);
    expect((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0].id } })).receivedQty.toNumber()).toBe(30);
  });

  it("posts once when the same key arrives concurrently", async () => {
    const po = await openPo([{ materialId: "pack", orderedQty: 100 }]);
    const input = { purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 10 }] };
    const key = randomUUID();
    const results = await Promise.all([run(key, input), run(key, input), run(key, input)]);
    expect(new Set(results.map((r) => r.body.grnNumber)).size).toBe(1);
    expect(await prisma.goodsReceipt.count({ where: { purchaseOrderId: po.id } })).toBe(1);
  });

  it("refuses a key reused for a different request", async () => {
    const po = await openPo([{ materialId: "pack", orderedQty: 100 }]);
    const key = randomUUID();
    await run(key, { purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 1 }] });
    const e = await failure(run(key, { purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 2 }] }));
    expect(e.message).toMatch(/already used for a different request/);
  });
});

describe("lot quality", () => {
  async function pendingLot(qty: number, coa?: string) {
    const po = await openPo([{ materialId: "raw", orderedQty: qty }]);
    const grn = await receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: qty, coaReference: coa }] });
    return grn.lines[0].lot!;
  }

  it("releases held stock to unrestricted, stamping who and when", async () => {
    const lot = await pendingLot(20, "COA-REL");
    const before = await f.balance(f.raw.id);
    const r = await decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(storekeeper));
    expect(r.qcStatus).toBe("APPROVED");
    expect(await f.balance(f.raw.id)).toEqual({ ...before, held: before.held - 20 });

    const row = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(row.releasedBy).toBe("Storekeeper");
    const grnLine = await prisma.goodsReceiptLine.findFirstOrThrow({ where: { lotId: lot.id } });
    expect(grnLine.inspectionStatus).toBe("APPROVED");
    expect(await prisma.auditLog.count({ where: { entityId: lot.id, action: "RELEASE" } })).toBe(1);
  });

  it("leaves quality decisions to quality:decide, apart from handling stock", async () => {
    // Receiving and adjusting stock does not make someone the quality release authority.
    const clerk = await f.actor(["goods-receipt:create", "inventory:update", "inventory:adjust"], "Clerk");
    const lot = await pendingLot(3, "COA-SOD");
    const e = await failure(decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(clerk)));
    expect(e.status).toBe(403);
    expect(e.message).toContain("quality:decide");
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).qcStatus).toBe("PENDING");
    await decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(storekeeper));
  });

  it("will not release a purchased lot with no certificate of analysis", async () => {
    const lot = await pendingLot(5);
    const e = await failure(decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(storekeeper)));
    expect(e.details).toEqual([{ path: "coaReference", message: "is required to release a purchased lot" }]);
    await decideLotQuality(lot.id, { status: "APPROVED", coaReference: "COA-LATE" }, f.ctx(storekeeper));
  });

  it("holds released stock again, and rejection returns what remains to the vendor — finally", async () => {
    const lot = await pendingLot(8, "COA-H");
    await decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(storekeeper));
    const released = await f.balance(f.raw.id);

    await decideLotQuality(lot.id, { status: "QUARANTINE", reason: "Customer complaint" }, f.ctx(storekeeper));
    expect(await f.balance(f.raw.id)).toEqual({ ...released, held: released.held + 8 });

    await decideLotQuality(lot.id, { status: "REJECTED", reason: "Failed retest" }, f.ctx(storekeeper));
    const after = await f.balance(f.raw.id);
    expect(after.onHand).toBe(released.onHand - 8);
    expect(after.held).toBe(released.held);

    const ret = await prisma.stockMovement.findFirstOrThrow({ where: { lotId: lot.id, type: "RETURN" } });
    expect(ret.quantity.toNumber()).toBe(-8);
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } })).remainingQty.toNumber()).toBe(0);

    expect((await failure(decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(storekeeper)))).message).toMatch(/cannot be reversed/);
  });
});

describe("cancellation", () => {
  it("cancels the remainder of a partly received PO, keeping what arrived", async () => {
    const po = await openPo([{ materialId: "pack", orderedQty: 100 }]);
    await receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: po.lines[0].id, receivedQty: 40 }] });
    await cancelPurchaseOrder(po.id, { reason: "Vendor cannot supply the balance" }, f.ctx(buyer));

    const row = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
    expect(row.status).toBe("CANCELLED");
    expect(row.lines[0].receivedQty.toNumber()).toBe(40);
    expect(row.notes).toMatch(/Vendor cannot supply the balance/);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: po.id, action: "CANCEL" } });
    expect(audit.newValues).toMatchObject({ reason: "Vendor cannot supply the balance", cancelledOutstanding: [{ qty: "60" }] });
  });
});

describe("valuation", () => {
  it("moves the material's standard cost to the moving average of what is on hand", async () => {
    // Priced at 20 against the vendor's 12 on file.
    const po = await createPurchaseOrder({
      vendorId: f.vendor.id, locationId: f.warehouse.id, expectedDeliveryDate: "2099-01-01",
      lines: [{ materialId: f.pack.id, orderedQty: 100, unitPrice: 20 }],
    }, f.ctx(buyer));
    await approvePurchaseOrder(po.id, f.ctx(approver));
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    await receive({ purchaseOrderId: po.id, lines: [{ purchaseOrderLineId: line.id, receivedQty: 100 }] });

    const all = await prisma.inventoryBalance.findMany({ where: { materialId: f.pack.id } });
    const qty = all.reduce((s, b) => s + b.onHandQty.toNumber(), 0);
    const value = all.reduce((s, b) => s + b.valuation.toNumber(), 0);
    const material = await prisma.material.findUniqueOrThrow({ where: { id: f.pack.id } });
    expect(material.standardCost!.toNumber()).toBeCloseTo(value / qty, 4);
    expect(await f.balance(f.pack.id, f.warehouse.id)).toMatchObject({ onHand: 100, value: 2000 });
  });
});
