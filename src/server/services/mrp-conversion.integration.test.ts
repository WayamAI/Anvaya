import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { todayIn } from "@/server/config/business-date";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { addDays } from "@/server/planning/dates";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { startMrpRun } from "./mrp-run.service";
import { listPlannedOrders, pagePlannedOrders } from "./mrp-read.service";
import { convertPlannedOrders } from "./mrp-convert.service";
import { approvePurchaseOrder, createPurchaseOrder } from "./purchase-order-write.service";
import { receiveGoods } from "./goods-receipt.service";

/**
 * Converting a plan keeps its timing. RM-T1 is bought lot for lot, at most
 * 100 per order, from SUP-T1 (7 days). Demand: 250 on day +30 and 80 on +40.
 * Plan: 100 + 100 + 50 for +30 (the maximum splits 250) and 80 for +40.
 */

let f: Fixture;
let planner: Awaited<ReturnType<Fixture["actor"]>>;
let today: string;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

async function salesOrder(n: number, qty: number, due: string) {
  await prisma.salesOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `SO-CNV-${n}-${f.tag}`, customerId: f.customer.id, orderDate: day(today), requiredDate: day(due),
      lines: { create: [{ lineNumber: 1, materialId: f.raw.id, locationId: f.plant.id, quantity: D(qty), unitPrice: D(50), requiredDate: day(due) }] },
    },
  });
}

beforeAll(async () => {
  f = await createFixture();
  today = todayIn("Asia/Kolkata");
  planner = await f.actor(["mrp:read", "mrp:run", "purchase-order:create", "purchase-order:approve", "purchase-order:read", "goods-receipt:create"], "Planner");
  await prisma.materialLocationPolicy.create({
    data: { materialId: f.raw.id, locationId: f.plant.id, procurementType: "BUY", lotSizingRule: "LOT_FOR_LOT", maxOrderQty: D(100) },
  });
  await salesOrder(1, 250, addDays(today, 30));
  await salesOrder(2, 80, addDays(today, 40));
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("converting a time-phased plan", () => {
  let runId: string;
  let poIds: string[];

  it("keeps every planned order on its own date and splits apart, one line each", async () => {
    const run = await startMrpRun({ horizonDays: 60, bucketSizeDays: 1, includeForecast: false, respectSafetyStock: true, simulation: false, asOfDate: today }, f.ctx(planner));
    runId = run.id;
    const planned = await listPlannedOrders(f.companyId, run.id, { type: "PURCHASE" });
    expect(planned.map((o) => `${o.quantity}@${o.requiredDate}`).sort()).toEqual(
      [`100@${addDays(today, 30)}`, `100@${addDays(today, 30)}`, `50@${addDays(today, 30)}`, `80@${addDays(today, 40)}`].sort(),
    );

    const result = await convertPlannedOrders(run.id, planned.map((o) => o.id), f.ctx(planner));
    poIds = result.purchaseOrders.map((p) => p.id);

    const pos = await prisma.purchaseOrder.findMany({
      where: { id: { in: poIds } }, include: { lines: { orderBy: { lineNumber: "asc" } } }, orderBy: { orderNumber: "asc" },
    });
    // Nothing summed, nothing pulled forward, no order above the maximum.
    const allLines = pos.flatMap((p) => p.lines.map((l) => `${l.orderedQty.toNumber()}@${l.expectedDeliveryDate.toISOString().slice(0, 10)}`));
    expect(allLines.sort()).toEqual(
      [`100@${addDays(today, 30)}`, `100@${addDays(today, 30)}`, `50@${addDays(today, 30)}`, `80@${addDays(today, 40)}`].sort(),
    );
    // The split orders share a date, so they sit on separate POs to the same vendor and plant.
    expect(pos).toHaveLength(3);
    expect(new Set(pos.map((p) => `${p.vendorId}|${p.locationId}`))).toEqual(new Set([`${f.vendor.id}|${f.plant.id}`]));
    const both = pos.find((p) => p.lines.length === 2)!;
    expect(both.expectedDeliveryDate.toISOString().slice(0, 10)).toBe(addDays(today, 30));

    // Each planned order points at the PO that carries it.
    const after = await prisma.plannedOrder.findMany({ where: { mrpRunId: run.id, type: "PURCHASE" } });
    expect(after.every((o) => o.status === "CONVERTED" && poIds.includes(o.convertedToPurchaseOrderId!))).toBe(true);
  });

  it("pages a run's planned orders by release date, and searches by material", async () => {
    const first = await pagePlannedOrders(f.companyId, runId, { limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.total).toBe(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await pagePlannedOrders(f.companyId, runId, { limit: 3, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(new Set(all.map((o) => o.id)).size).toBe(4);
    expect(all.map((o) => o.releaseDate)).toEqual([...all.map((o) => o.releaseDate)].sort());
    expect((await pagePlannedOrders(f.companyId, runId, { limit: 50, q: "rm-t1" })).total).toBe(4);
    expect((await pagePlannedOrders(f.companyId, runId, { limit: 50, q: "no such material" })).items).toEqual([]);
  });

  it("receives against the right line when one material is on a PO twice", async () => {
    const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: { in: poIds } }, include: { lines: { orderBy: { lineNumber: "asc" } } }, orderBy: { orderNumber: "asc" } });
    const twoLines = po.lines.length === 2 ? po : await prisma.purchaseOrder.findFirstOrThrow({
      where: { id: { in: poIds }, lines: { some: { lineNumber: 2 } } }, include: { lines: { orderBy: { lineNumber: "asc" } } },
    });
    await approvePurchaseOrder(twoLines.id, f.ctx(planner));
    const later = twoLines.lines[1];
    await runInTransaction((tx) => receiveGoods(tx, { purchaseOrderId: twoLines.id, lines: [{ purchaseOrderLineId: later.id, receivedQty: 30, inspectionStatus: "APPROVED" }] }, f.ctx(planner)));

    const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: twoLines.id }, orderBy: { lineNumber: "asc" } });
    expect(lines.map((l) => l.receivedQty.toNumber())).toEqual([0, 30]);

    // The next run counts each line's outstanding quantity as supply on its
    // own date, and the released 30 as stock. (Received APPROVED: stock held
    // for inspection is not yet usable supply.)
    const next = await startMrpRun({ horizonDays: 60, bucketSizeDays: 1, includeForecast: false, respectSafetyStock: true, simulation: false, asOfDate: today }, f.ctx(planner));
    const again = await listPlannedOrders(f.companyId, next.id, { type: "PURCHASE" });
    expect(again).toEqual([]);
  });

  it("does not let another company convert or see the run", async () => {
    const other = await createFixture();
    try {
      const outsider = await other.actor(["mrp:read", "mrp:run", "purchase-order:create"], "Outsider");
      expect((await failure(convertPlannedOrders(runId, ["anything"], other.ctx(outsider)))).status).toBe(404);
      expect((await failure(listPlannedOrders(other.companyId, runId, {}))).status).toBe(404);
    } finally {
      await other.destroy();
    }
  });
});

describe("raising a purchase order by hand", () => {
  it("allows one material on two dates but not twice on one date", async () => {
    const base = { vendorId: f.vendor.id, locationId: f.plant.id, expectedDeliveryDate: addDays(today, 10) };
    const ok = await createPurchaseOrder({ ...base, lines: [
      { materialId: f.raw.id, orderedQty: 10, expectedDeliveryDate: addDays(today, 10) },
      { materialId: f.raw.id, orderedQty: 20, expectedDeliveryDate: addDays(today, 20) },
    ] }, f.ctx(planner));
    expect(await prisma.purchaseOrderLine.count({ where: { purchaseOrderId: ok.id } })).toBe(2);

    const e = await failure(createPurchaseOrder({ ...base, lines: [
      { materialId: f.raw.id, orderedQty: 10 },
      { materialId: f.raw.id, orderedQty: 20, expectedDeliveryDate: addDays(today, 10) },
    ] }, f.ctx(planner)));
    expect(e.status).toBe(422);
    expect(e.details?.[0].path).toBe("lines.1.materialId");
  });
});
