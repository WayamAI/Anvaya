import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { todayIn } from "@/server/config/business-date";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { addDays } from "@/server/planning/dates";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { startMrpRun } from "./mrp-run.service";
import { listPlannedOrders, materialRequirements, timePhased } from "./mrp-read.service";
import { receiveGoods } from "./goods-receipt.service";
import { decideLotQuality } from "./lot-quality.service";
import { dispatchSalesOrder } from "./sales-order-write.service";

/**
 * Received stock awaiting inspection, against Postgres. 100 of each material
 * is sold for day +20 and 100 is on order for day +10, so MRP needs nothing
 * new — and must still need nothing once the goods arrive, whether they are
 * released at the dock (PM-T1) or held for quality (RM-T1, batch tracked).
 */

let f: Fixture;
let user: Awaited<ReturnType<Fixture["actor"]>>;
let today: string;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = () => startMrpRun({ horizonDays: 60, bucketSizeDays: 1, includeForecast: false, respectSafetyStock: true, simulation: false, asOfDate: today }, f.ctx(user));
const planned = async (materialId: string) => (await listPlannedOrders(f.companyId, (await run()).id, { type: "PURCHASE", materialId })).map((o) => o.quantity);
const requirement = async (runId: string, materialId: string) => (await materialRequirements(f.companyId, runId)).find((m) => m.material.id === materialId)!;

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

async function onOrder(material: { id: string }, n: number) {
  return prisma.purchaseOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `PO-QC-${n}-${f.tag}`, vendorId: f.vendor.id, locationId: f.plant.id, status: "ORDERED",
      orderDate: day(today), expectedDeliveryDate: day(addDays(today, 10)), createdById: user.userId,
      lines: { create: [{ lineNumber: 1, materialId: material.id, orderedQty: D(100), unitPrice: D(10), lineTotal: D(1000), expectedDeliveryDate: day(addDays(today, 10)) }] },
    },
    include: { lines: true },
  });
}

let rmPo: Awaited<ReturnType<typeof onOrder>>;
let pmPo: Awaited<ReturnType<typeof onOrder>>;
let salesOrderId: string;

beforeAll(async () => {
  f = await createFixture();
  today = todayIn("Asia/Kolkata");
  user = await f.actor(["mrp:read", "mrp:run", "goods-receipt:create", "quality:decide", "sales-order:dispatch"], "Planner");
  await prisma.materialLocationPolicy.createMany({ data: [
    { materialId: f.raw.id, locationId: f.plant.id, procurementType: "BUY" },
    { materialId: f.pack.id, locationId: f.plant.id, procurementType: "BUY" },
  ] });
  const so = await prisma.salesOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `SO-QC-${f.tag}`, customerId: f.customer.id, orderDate: day(today), requiredDate: day(addDays(today, 20)),
      lines: { create: [
        { lineNumber: 1, materialId: f.raw.id, locationId: f.plant.id, quantity: D(100), unitPrice: D(50), requiredDate: day(addDays(today, 20)) },
        { lineNumber: 2, materialId: f.pack.id, locationId: f.plant.id, quantity: D(100), unitPrice: D(5), requiredDate: day(addDays(today, 20)) },
      ] },
    },
  });
  salesOrderId = so.id;
  rmPo = await onOrder(f.raw, 1);
  pmPo = await onOrder(f.pack, 2);
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("stock awaiting inspection", () => {
  it("needs nothing new while the goods are on order", async () => {
    expect(await planned(f.raw.id)).toEqual([]);
    expect(await planned(f.pack.id)).toEqual([]);
  });

  it("needs nothing new once a receipt is released at the dock, and it is usable stock", async () => {
    await runInTransaction((tx) => receiveGoods(tx, { purchaseOrderId: pmPo.id, lines: [{ purchaseOrderLineId: pmPo.lines[0].id, receivedQty: 100 }] }, f.ctx(user)));
    const r = await run();
    expect(await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE", materialId: f.pack.id })).toEqual([]);
    expect(await requirement(r.id, f.pack.id)).toMatchObject({ openingStock: 100, scheduledReceipts: 0 });
  });

  it("needs nothing new while a receipt awaits inspection, yet the stock cannot be used", async () => {
    await runInTransaction((tx) => receiveGoods(tx, {
      purchaseOrderId: rmPo.id, lines: [{ purchaseOrderLineId: rmPo.lines[0].id, receivedQty: 100, coaReference: "COA-QC-1" }],
    }, f.ctx(user)));
    expect(await f.balance(f.raw.id)).toMatchObject({ onHand: 100, held: 100 });

    const r = await run();
    expect(await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE", materialId: f.raw.id })).toEqual([]);
    // Projected available counts it as expected on the planning date; usable stock does not.
    expect(await requirement(r.id, f.raw.id)).toMatchObject({ openingStock: 0, scheduledReceipts: 100 });
    expect((await timePhased(f.companyId, r.id, f.raw.id, f.plant.id))[0]).toMatchObject({ bucketStart: today, scheduledReceipts: 100 });

    // QC controls are untouched: nothing awaiting inspection can ship.
    const line = await prisma.salesOrderLine.findFirstOrThrow({ where: { salesOrderId, lineNumber: 1 } });
    const e = await failure(runInTransaction((tx) => dispatchSalesOrder(tx, salesOrderId, { lines: [{ salesOrderLineId: line.id, quantity: 10 }] }, f.ctx(user))));
    expect(e.status).toBe(422);
  });

  it("counts the stock as usable once quality releases it, still needing nothing new", async () => {
    const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { materialId: f.raw.id, locationId: f.plant.id, qcStatus: "PENDING" } });
    await decideLotQuality(lot.id, { status: "APPROVED" }, f.ctx(user));
    const r = await run();
    expect(await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE", materialId: f.raw.id })).toEqual([]);
    expect(await requirement(r.id, f.raw.id)).toMatchObject({ openingStock: 100, scheduledReceipts: 0 });
  });

  it("plans the need again when quality rejects the stock instead", async () => {
    const lot = await prisma.inventoryLot.findFirstOrThrow({ where: { materialId: f.raw.id, locationId: f.plant.id } });
    await decideLotQuality(lot.id, { status: "REJECTED", reason: "Failed assay" }, f.ctx(user));
    expect(await planned(f.raw.id)).toEqual([100]);
  });
});
