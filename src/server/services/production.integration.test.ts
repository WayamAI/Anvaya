import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { runIdempotent, hashBody } from "@/server/api/idempotency";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import {
  cancelWorkOrder, closeWorkOrder, createWorkOrder, firmWorkOrder, issueComponents, releaseWorkOrder,
  reportOutput, updateWorkOrder,
} from "./work-order-write.service";
import { decideLotQuality } from "./lot-quality.service";
import { getLotDetail, getLotIndicators } from "./lot.service";
import type { IssueInput, OutputInput } from "@/server/validation/production";

/**
 * Work order lifecycle against Postgres: BOM snapshot, multi-lot component
 * issue, output into a produced lot at actual cost, and the trace both ways.
 *
 * BOM: 100 PCS of FG-T1 take 50 kg RM-T1 (2% scrap) and 100 PCS PM-T1.
 */

let f: Fixture;
let planner: Awaited<ReturnType<Fixture["actor"]>>;
let floor: Awaited<ReturnType<Fixture["actor"]>>;

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

/** A released raw-material lot, with its receipt and CoA, and matching stock. */
async function rawLot(suffix: string, qty: number, cost: number, expiry: string | null = null) {
  const lot = await prisma.inventoryLot.create({
    data: {
      materialId: f.raw.id, locationId: f.plant.id, lotNumber: `${f.tag}-${suffix}`, vendorId: f.vendor.id,
      receivedQty: D(qty), remainingQty: D(qty), receiptDate: day("2026-01-01"), expiryDate: expiry ? day(expiry) : null,
      qcStatus: "APPROVED", coaReference: `COA-${suffix}`,
    },
  });
  await prisma.inventoryBalance.upsert({
    where: { materialId_locationId: { materialId: f.raw.id, locationId: f.plant.id } },
    create: { materialId: f.raw.id, locationId: f.plant.id, onHandQty: D(qty), valuation: D(qty * cost) },
    update: { onHandQty: { increment: D(qty) }, valuation: { increment: D(qty * cost) } },
  });
  return lot;
}

async function packStock(qty: number, cost: number) {
  await prisma.inventoryBalance.upsert({
    where: { materialId_locationId: { materialId: f.pack.id, locationId: f.plant.id } },
    create: { materialId: f.pack.id, locationId: f.plant.id, onHandQty: D(qty), valuation: D(qty * cost) },
    update: { onHandQty: { increment: D(qty) }, valuation: { increment: D(qty * cost) } },
  });
}

const plan = (qty = 100) => createWorkOrder({
  materialId: f.finished.id, locationId: f.plant.id, plannedQty: qty,
  plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-05",
  operations: [{ name: "Blend", workCentre: "BLEND-01", setupMinutes: 30, runMinutes: 120 }],
}, f.ctx(planner));

const issue = (id: string, input: IssueInput) => runInTransaction((tx) => issueComponents(tx, id, input, f.ctx(floor)));
const output = (id: string, input: OutputInput) => runInTransaction((tx) => reportOutput(tx, id, input, f.ctx(floor)));

beforeAll(async () => {
  f = await createFixture();
  planner = await f.actor(["work-order:create", "work-order:update"], "Planner");
  floor = await f.actor(["work-order:update", "inventory:update"], "Floor");

  const bom = await prisma.bom.create({ data: { companyId: f.companyId, materialId: f.finished.id, code: "BOM-FG-T1", name: "Test detergent" } });
  await prisma.bomVersion.create({
    data: {
      bomId: bom.id, version: "A", baseQuantity: D(100), isActive: true, effectiveFrom: day("2026-01-01"),
      components: {
        create: [
          { materialId: f.raw.id, quantity: D(50), unitOfMeasureId: f.kg.id, scrapFactor: D(0.02), position: 1 },
          { materialId: f.pack.id, quantity: D(100), unitOfMeasureId: f.pcs.id, position: 2 },
        ],
      },
    },
  });
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("planning", () => {
  it("snapshots components from the active BOM and numbers the order", async () => {
    const wo = await plan(200);
    expect(wo.orderNumber).toMatch(/^WO-\d{4}-0001$/);
    const comps = await prisma.workOrderComponent.findMany({ where: { workOrderId: wo.id }, include: { material: true } });
    expect(Object.fromEntries(comps.map((c) => [c.material.code, c.requiredQty.toNumber()]))).toEqual({ "RM-T1": 102, "PM-T1": 200 });
    expect(await prisma.workOrderOperation.count({ where: { workOrderId: wo.id } })).toBe(1);

    // Re-planning the quantity re-takes the snapshot.
    await updateWorkOrder(wo.id, { plannedQty: 100 }, f.ctx(planner));
    const again = await prisma.workOrderComponent.findFirstOrThrow({ where: { workOrderId: wo.id, materialId: f.raw.id } });
    expect(again.requiredQty.toNumber()).toBe(51);

    await firmWorkOrder(wo.id, f.ctx(planner));
    await releaseWorkOrder(wo.id, f.ctx(planner));
    expect((await failure(updateWorkOrder(wo.id, { plannedQty: 5 }, f.ctx(planner)))).status).toBe(409);
    await cancelWorkOrder(wo.id, { reason: "Plan changed" }, f.ctx(planner));
  });

  it("refuses a non-manufacturing location and a product with no BOM", async () => {
    const e = await failure(createWorkOrder({
      materialId: f.finished.id, locationId: f.warehouse.id, plannedQty: 1, plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-01",
    }, f.ctx(planner)));
    expect(e.details).toEqual([{ path: "locationId", message: "WH is not a manufacturing location" }]);

    const noBom = await failure(createWorkOrder({
      materialId: f.pack.id, locationId: f.plant.id, plannedQty: 1, plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-01",
    }, f.ctx(planner)));
    expect(noBom.message).toMatch(/no active BOM/);
  });
});

describe("production", () => {
  it("issues a component across lots FEFO, reports output at actual cost, and traces both ways", async () => {
    const soon = await rawLot("SOON", 30, 10, "2098-01-01");
    const late = await rawLot("LATE", 100, 14, "2099-01-01");
    await packStock(150, 2);

    const wo = await plan(100);
    await releaseWorkOrder(wo.id, f.ctx(planner));

    const iss = await issue(wo.id, { lines: [{ materialId: f.raw.id, quantity: 51 }, { materialId: f.pack.id, quantity: 100 }] });
    expect(iss.workOrder.status).toBe("IN_PROGRESS");
    expect(iss.lines[0].lots.map((l) => [l.lotNumber.split("-").at(-1), l.quantity])).toEqual([["SOON", 30], ["LATE", 21]]);

    const comp = await prisma.workOrderComponent.findFirstOrThrow({ where: { workOrderId: wo.id, materialId: f.raw.id } });
    expect(comp.issuedQty.toNumber()).toBe(51);
    expect(comp.lotId).toBe(soon.id);
    expect(await f.balance(f.raw.id)).toMatchObject({ onHand: 79 });
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 50, value: 100 });

    // Raw value issued at the balance's average: (300 + 1400) / 130 = 13.0769 per kg.
    const issued = await prisma.stockMovement.findMany({ where: { referenceId: wo.id, type: "PRODUCTION_ISSUE" } });
    const issuedValue = issued.reduce((s, m) => s + Math.abs(m.quantity.toNumber()) * m.unitCost!.toNumber(), 0);

    const out = await output(wo.id, { quantity: 60, scrappedQty: 2 });
    expect(out.lot!.lotNumber).toMatch(/^FGB-\d{4}-0001$/);
    expect(out.lot!.qcStatus).toBe("PENDING");
    expect(out.unitCost).toBeCloseTo((issuedValue * 0.6) / 60, 3);
    expect(await f.balance(f.finished.id)).toMatchObject({ onHand: 60, held: 60 });

    const last = await output(wo.id, { quantity: 40, complete: true });
    expect(last.workOrder).toMatchObject({ status: "COMPLETED", producedQty: 100, scrappedQty: 2 });
    // Everything issued is now in finished stock, to the paisa.
    const fg = await f.balance(f.finished.id);
    expect(fg.value).toBeCloseTo(issuedValue, 1);

    // Backward: the finished lot names both raw lots it was made from.
    const back = await getLotDetail(f.companyId, out.lot!.id);
    const rawInputs = back.production!.inputs.filter((i) => i.material.code === "RM-T1");
    expect(rawInputs.map((i) => [i.lot!.lotNumber.split("-").at(-1), i.issuedQty]).sort()).toEqual([["LATE", 21], ["SOON", 30]]);

    // Forward: the later raw lot, not on the component row, still leads to the order.
    const fwd = await getLotDetail(f.companyId, late.id);
    expect(fwd.usedIn).toEqual([expect.objectContaining({ orderNumber: wo.orderNumber, issuedQty: 21 })]);

    // And the ledger issue is not double-counted as a component issue.
    const ind = await getLotIndicators(f.companyId);
    expect(ind.forwardPct).toBe(100);

    await closeWorkOrder(wo.id, f.ctx(planner));
    expect((await failure(output(wo.id, { quantity: 1 }))).status).toBe(409);

    // Produced lots release without a CoA (no vendor), then can ship.
    await decideLotQuality(out.lot!.id, { status: "APPROVED" }, f.ctx(floor));
  });

  it("will not issue short stock, and rolls the whole issue back", async () => {
    await packStock(10, 2); // 60 PCS on hand after the first test; the order needs 100.
    const wo = await plan(100);
    await releaseWorkOrder(wo.id, f.ctx(planner));
    const before = { raw: await f.balance(f.raw.id), pack: await f.balance(f.pack.id) };
    expect(before.pack.onHand).toBeLessThan(100);
    const e = await failure(issue(wo.id, { lines: [{ materialId: f.raw.id, quantity: 51 }, { materialId: f.pack.id, quantity: 100 }] }));
    expect(e.status).toBe(422);
    // The raw line could have gone, but did not: nothing is half-posted.
    expect({ raw: await f.balance(f.raw.id), pack: await f.balance(f.pack.id) }).toEqual(before);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).status).toBe("RELEASED");
  });

  it("caps output at plan plus tolerance and cannot cancel once material is issued", async () => {
    await packStock(200, 2);
    const wo = await plan(10);
    await releaseWorkOrder(wo.id, f.ctx(planner));
    await issue(wo.id, { lines: [{ materialId: f.pack.id, quantity: 10 }] });
    expect((await failure(output(wo.id, { quantity: 12 }))).message).toMatch(/more than the planned 10 plus 10%/);
    expect((await failure(cancelWorkOrder(wo.id, { reason: "no" }, f.ctx(planner)))).status).toBe(409);
  });

  it("applies a retried output report once", async () => {
    const wo = await plan(10);
    await releaseWorkOrder(wo.id, f.ctx(planner));
    const input = { quantity: 4, qcStatus: "APPROVED" as const };
    const key = randomUUID();
    const run = () => runIdempotent(
      { companyId: f.companyId, userId: floor.userId, key, scope: `work-order:output:${wo.id}`, requestHash: hashBody(input) },
      201,
      (tx) => reportOutput(tx, wo.id, input, f.ctx(floor)),
    );
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.body.lot!.lotNumber).toBe(b.body.lot!.lotNumber);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).producedQty.toNumber()).toBe(4);
  });
});
