import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { runIdempotent, hashBody } from "@/server/api/idempotency";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import {
  cancelSalesOrder, createSalesOrder, deliverSalesOrder, dispatchSalesOrder, updateSalesOrder,
} from "./sales-order-write.service";
import { getLotDetail } from "./lot.service";
import type { DispatchInput } from "@/server/validation/sales";

/**
 * Sales order → dispatch → delivery against Postgres: FEFO lot draws, stock
 * limits, concurrency, idempotency and forward traceability.
 */

let f: Fixture;
let sales: Awaited<ReturnType<Fixture["actor"]>>;
let warehouse: Awaited<ReturnType<Fixture["actor"]>>;

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Finished-good stock in released lots, plus untracked packaging stock, at the plant. */
async function stock(lots: { lotNumber: string; qty: number; expiry: string | null; qc?: "APPROVED" | "QUARANTINE" }[], packQty = 0) {
  for (const l of lots) {
    const lot = await prisma.inventoryLot.create({
      data: {
        materialId: f.finished.id, locationId: f.plant.id, lotNumber: `${f.tag}-${l.lotNumber}`,
        receivedQty: D(l.qty), remainingQty: D(l.qty), receiptDate: day("2026-01-01"),
        expiryDate: l.expiry ? day(l.expiry) : null, qcStatus: l.qc ?? "APPROVED",
      },
    });
    await addBalance(f.finished.id, l.qty, l.qc === "QUARANTINE" ? l.qty : 0, 50);
    await prisma.stockMovement.create({
      data: {
        materialId: f.finished.id, locationId: f.plant.id, lotId: lot.id, type: "PRODUCTION_RECEIPT",
        quantity: D(l.qty), unitCost: D(50), balanceAfter: D(0), referenceType: "TEST", referenceId: lot.id,
      },
    });
  }
  if (packQty) await addBalance(f.pack.id, packQty, 0, 2);
}

async function addBalance(materialId: string, qty: number, held: number, cost: number) {
  await prisma.inventoryBalance.upsert({
    where: { materialId_locationId: { materialId, locationId: f.plant.id } },
    create: { materialId, locationId: f.plant.id, onHandQty: D(qty), quarantineQty: D(held), valuation: D(qty * cost) },
    update: { onHandQty: { increment: D(qty) }, quarantineQty: { increment: D(held) }, valuation: { increment: D(qty * cost) } },
  });
}

async function resetStock() {
  await prisma.stockMovement.deleteMany({ where: { materialId: { in: [f.finished.id, f.pack.id] } } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrder: { companyId: f.companyId } } });
  await prisma.salesOrder.deleteMany({ where: { companyId: f.companyId } });
  await prisma.inventoryLot.deleteMany({ where: { materialId: f.finished.id } });
  await prisma.inventoryBalance.deleteMany({ where: { materialId: { in: [f.finished.id, f.pack.id] } } });
}

async function book(fg: number, pack = 0) {
  const so = await createSalesOrder({
    customerId: f.customer.id, locationId: f.plant.id, requiredDate: "2099-01-01",
    lines: [
      { materialId: f.finished.id, quantity: fg, unitPrice: 120 },
      ...(pack ? [{ materialId: f.pack.id, quantity: pack, unitPrice: 5 }] : []),
    ],
  }, f.ctx(sales));
  const lines = await prisma.salesOrderLine.findMany({ where: { salesOrderId: so.id }, orderBy: { lineNumber: "asc" } });
  return { ...so, lines };
}

const dispatch = (id: string, input: DispatchInput, who = warehouse) =>
  runInTransaction((tx) => dispatchSalesOrder(tx, id, input, f.ctx(who)));

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  f = await createFixture();
  sales = await f.actor(["sales-order:create", "sales-order:update", "sales-order:read"], "Sales");
  warehouse = await f.actor(["sales-order:dispatch"], "Warehouse");
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("booking", () => {
  it("books a CONFIRMED order with the next number and a Decimal total", async () => {
    await prisma.salesOrder.create({
      data: { companyId: f.companyId, orderNumber: "SO-4566", customerId: f.customer.id, orderDate: day("2026-01-01"), requiredDate: day("2026-01-05"), status: "CANCELLED" },
    });
    const so = await book(10, 3);
    expect(so.orderNumber).toBe("SO-4567");
    const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id } });
    expect(row).toMatchObject({ status: "CONFIRMED", deliveryStatus: "PENDING" });
    expect(row.totalAmount.toNumber()).toBe(1215);
    await resetStock();
  });

  it("needs a ship-from location on every line", async () => {
    const e = await failure(createSalesOrder({
      customerId: f.customer.id, requiredDate: "2099-01-01", lines: [{ materialId: f.finished.id, quantity: 1, unitPrice: 1 }],
    }, f.ctx(sales)));
    expect(e.details).toEqual([{ path: "lines.0.locationId", message: "is required when the order has no default location" }]);
  });

  it("edits only while nothing has shipped", async () => {
    await stock([{ lotNumber: "E1", qty: 20, expiry: null }]);
    const so = await book(10);
    await updateSalesOrder(so.id, { lines: [{ materialId: f.finished.id, locationId: f.plant.id, quantity: 12, unitPrice: 100 }] }, f.ctx(sales));
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).totalAmount.toNumber()).toBe(1200);

    const line = await prisma.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: so.id } });
    await dispatch(so.id, { lines: [{ salesOrderLineId: line.id, quantity: 2 }] });
    expect((await failure(updateSalesOrder(so.id, { notes: "change" }, f.ctx(sales)))).status).toBe(409);
    await resetStock();
  });
});

describe("dispatch", () => {
  it("ships first-expiry-first-out, posts ISSUE rows per lot, and moves the order along", async () => {
    await stock([
      { lotNumber: "LATE", qty: 10, expiry: "2099-06-01" },
      { lotNumber: "SOON", qty: 6, expiry: "2098-01-01" },
      { lotNumber: "HELD", qty: 50, expiry: "2097-01-01", qc: "QUARANTINE" },
    ], 100);
    const so = await book(12, 40);

    const r = await dispatch(so.id, {
      invoiceNumber: "INV-1",
      lines: [{ salesOrderLineId: so.lines[0].id, quantity: 12 }, { salesOrderLineId: so.lines[1].id, quantity: 30 }],
    });

    expect(r.salesOrder.status).toBe("PROCESSING");
    expect(r.lines[0].lots.map((l) => [l.lotNumber.split("-").at(-1), l.quantity])).toEqual([["SOON", 6], ["LATE", 6]]);
    expect(r.lines[1]).toMatchObject({ quantity: 30, shippedQty: 30, lots: [] });

    // 66 on hand of which 50 held → 16 usable; 12 shipped leaves 54 (50 still held).
    expect(await f.balance(f.finished.id)).toMatchObject({ onHand: 54, held: 50 });
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 70, value: 140 });

    const issues = await prisma.stockMovement.findMany({ where: { referenceId: so.lines[0].id, type: "ISSUE" } });
    expect(issues.map((m) => m.quantity.toNumber()).sort()).toEqual([-6, -6]);
    expect(issues.every((m) => m.referenceType === "SALES_ORDER_LINE" && m.postedById === warehouse.userId)).toBe(true);

    const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id } });
    expect(row.invoiceNumber).toBe("INV-1");
    expect(await prisma.auditLog.count({ where: { entityId: so.id, action: "DISPATCH" } })).toBe(1);

    // Rest of the packaging: now every line is complete.
    const last = await dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[1].id, quantity: 10 }] });
    expect(last.salesOrder.status).toBe("DISPATCHED");
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).deliveryStatus).toBe("IN_TRANSIT");

    await deliverSalesOrder(so.id, {}, f.ctx(warehouse));
    expect(await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id } })).toMatchObject({ status: "DELIVERED", deliveryStatus: "DELIVERED" });
    await resetStock();
  });

  it("is visible in forward traceability: the lot shows the order it shipped on", async () => {
    await stock([{ lotNumber: "TRACE", qty: 5, expiry: null }]);
    const so = await book(5);
    const r = await dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[0].id, quantity: 5 }] });
    const detail = await getLotDetail(f.companyId, r.lines[0].lots[0].lotId);
    expect(JSON.stringify(detail)).toContain(so.orderNumber);
    await resetStock();
  });

  it("ships named lots, refusing held, expired, foreign or short ones", async () => {
    await stock([
      { lotNumber: "OK", qty: 5, expiry: null },
      { lotNumber: "Q", qty: 5, expiry: null, qc: "QUARANTINE" },
      { lotNumber: "OLD", qty: 5, expiry: "2020-01-01" },
    ]);
    const lots = Object.fromEntries((await prisma.inventoryLot.findMany({ where: { materialId: f.finished.id } })).map((l) => [l.lotNumber.split("-").at(-1), l.id]));
    const so = await book(10);
    const e = await failure(dispatch(so.id, {
      lines: [{ salesOrderLineId: so.lines[0].id, quantity: 10, lots: [{ lotId: lots.Q, quantity: 4 }, { lotId: lots.OLD, quantity: 3 }, { lotId: lots.OK, quantity: 3 }] }],
    }));
    expect(e.details?.map((d) => d.message)).toEqual([
      expect.stringMatching(/QUARANTINE, not released/), expect.stringMatching(/expired on 2020-01-01/),
    ]);

    const short = await failure(dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[0].id, quantity: 6, lots: [{ lotId: lots.OK, quantity: 6 }] }] }));
    expect(short.details?.[0].message).toMatch(/has 5 remaining/);

    const ok = await dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[0].id, quantity: 5, lots: [{ lotId: lots.OK, quantity: 5 }] }] });
    expect(ok.lines[0].lots).toHaveLength(1);
    await resetStock();
  });

  it("refuses to ship more than released stock, leaving nothing half-done", async () => {
    await stock([{ lotNumber: "A", qty: 3, expiry: null }], 1);
    const so = await book(5, 1);
    const e = await failure(dispatch(so.id, {
      lines: [{ salesOrderLineId: so.lines[1].id, quantity: 1 }, { salesOrderLineId: so.lines[0].id, quantity: 5 }],
    }));
    expect(e.details?.[0]).toMatchObject({ path: "lines.1.quantity" });
    // The packaging line that could ship did not: the whole dispatch rolled back.
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 1 });
    expect((await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: so.lines[1].id } })).shippedQty.toNumber()).toBe(0);
    await resetStock();
  });

  it("never lets concurrent dispatches oversell the same stock", async () => {
    await stock([], 10);
    const orders = await Promise.all([1, 2, 3].map(async () => {
      const so = await createSalesOrder({
        customerId: f.customer.id, locationId: f.plant.id, requiredDate: "2099-01-01",
        lines: [{ materialId: f.pack.id, quantity: 4, unitPrice: 5 }],
      }, f.ctx(sales));
      return { id: so.id, line: (await prisma.salesOrderLine.findFirstOrThrow({ where: { salesOrderId: so.id } })).id };
    }));
    const results = await Promise.allSettled(orders.map((o) => dispatch(o.id, { lines: [{ salesOrderLineId: o.line, quantity: 4 }] })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 2 });
    const movements = await prisma.stockMovement.findMany({ where: { materialId: f.pack.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => m.balanceAfter.toNumber())).toEqual([6, 2]);
    await resetStock();
  });

  it("applies a retried dispatch once", async () => {
    await stock([], 10);
    const so = await book(1, 5);
    const input = { lines: [{ salesOrderLineId: so.lines[1].id, quantity: 5 }] };
    const key = randomUUID();
    const run = () => runIdempotent(
      { companyId: f.companyId, userId: warehouse.userId, key, scope: `sales-order:dispatch:${so.id}`, requestHash: hashBody(input) },
      201,
      (tx) => dispatchSalesOrder(tx, so.id, input, f.ctx(warehouse)),
    );
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 5 });
    await resetStock();
  });
});

describe("cancel and deliver", () => {
  it("cancels the remainder after a partial dispatch and refuses delivery before dispatch", async () => {
    await stock([], 10);
    const so = await book(1, 8);
    expect((await failure(deliverSalesOrder(so.id, {}, f.ctx(warehouse)))).message).toMatch(/must be DISPATCHED/);

    await dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[1].id, quantity: 3 }] });
    await cancelSalesOrder(so.id, { reason: "Customer reduced the order" }, f.ctx(sales));
    const row = await prisma.salesOrder.findUniqueOrThrow({ where: { id: so.id }, include: { lines: { orderBy: { lineNumber: "asc" } } } });
    expect(row.status).toBe("CANCELLED");
    expect(row.lines[1].shippedQty.toNumber()).toBe(3);
    expect((await failure(dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[1].id, quantity: 1 }] }))).status).toBe(409);
    await resetStock();
  });

  it("keeps permissions separate: sales cannot ship, the warehouse cannot book", async () => {
    await stock([], 5);
    const so = await book(1, 1);
    expect((await failure(dispatch(so.id, { lines: [{ salesOrderLineId: so.lines[1].id, quantity: 1 }] }, sales))).status).toBe(403);
    expect((await failure(createSalesOrder({
      customerId: f.customer.id, locationId: f.plant.id, requiredDate: "2099-01-01", lines: [{ materialId: f.pack.id, quantity: 1, unitPrice: 1 }],
    }, f.ctx(warehouse)))).status).toBe(403);
    await resetStock();
  });
});
