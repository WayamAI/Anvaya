import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { todayIn } from "@/server/config/business-date";
import { AppError } from "@/server/errors/app-error";
import { addDays } from "@/server/planning/dates";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { startMrpRun, resolveException } from "./mrp-run.service";
import { getPlannedOrder, getRun, listExceptions, listPlannedOrders, materialRequirements, timePhased } from "./mrp-read.service";
import { convertPlannedOrders } from "./mrp-convert.service";

/**
 * MRP end to end against Postgres: snapshot → engine → stored plan →
 * conversion into real orders.
 *
 * Product FG-T1 (100 PCS) = 50 kg RM-T1 (2% scrap) + 100 PCS PM-T1.
 * Demand: 200 FG on day +20. Stock: 50 PM. Plan, by hand:
 *   FG  make 200, 2-day lead → release +18
 *   RM  50/100 × 200 × 1.02 = 102 kg on +18 → min 100, multiple 50 → 150; vendor 7 days → +11
 *   PM  200 − 50 on hand = 150 on +18; lot for lot; vendor 5 days → +13
 */

let f: Fixture;
let planner: Awaited<ReturnType<Fixture["actor"]>>;
let today: string;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

const run = (over = {}) => startMrpRun({ asOfDate: today, horizonDays: 60, bucketSizeDays: 1, includeForecast: true, respectSafetyStock: true, ...over }, f.ctx(planner));

beforeAll(async () => {
  f = await createFixture();
  today = todayIn("Asia/Kolkata");
  planner = await f.actor(["mrp:read", "mrp:run", "purchase-order:create", "work-order:create"], "Planner");

  const bom = await prisma.bom.create({ data: { companyId: f.companyId, materialId: f.finished.id, code: "BOM-MRP", name: "FG" } });
  await prisma.bomVersion.create({
    data: {
      bomId: bom.id, version: "A", baseQuantity: D(100), isActive: true, effectiveFrom: new Date("2026-01-01"),
      components: { create: [
        { materialId: f.raw.id, quantity: D(50), unitOfMeasureId: f.kg.id, scrapFactor: D(0.02) },
        { materialId: f.pack.id, quantity: D(100), unitOfMeasureId: f.pcs.id, position: 1 },
      ] },
    },
  });
  await prisma.materialLocationPolicy.createMany({
    data: [
      { materialId: f.finished.id, locationId: f.plant.id, procurementType: "MAKE", productionLeadTimeDays: 2 },
      { materialId: f.raw.id, locationId: f.plant.id, procurementType: "BUY", lotSizingRule: "MIN_ORDER_QTY", minOrderQty: D(100), orderMultiple: D(50) },
      { materialId: f.pack.id, locationId: f.plant.id, procurementType: "BUY" },
    ],
  });
  // Only the approved vendor supplies PM, so it is chosen without a preference.
  await prisma.inventoryBalance.create({ data: { materialId: f.pack.id, locationId: f.plant.id, onHandQty: D(50), valuation: D(125) } });
  await prisma.salesOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `SO-MRP-${f.tag}`, customerId: f.customer.id,
      orderDate: new Date(`${today}T00:00:00Z`), requiredDate: new Date(`${addDays(today, 20)}T00:00:00Z`),
      lines: { create: [{ lineNumber: 1, materialId: f.finished.id, locationId: f.plant.id, quantity: D(200), unitPrice: D(100), requiredDate: new Date(`${addDays(today, 20)}T00:00:00Z`) }] },
    },
  });
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("an MRP run", () => {
  let runId: string;

  it("plans every level, stores it, and records the run", async () => {
    const r = await run();
    runId = r.id;
    const summary = await getRun(f.companyId, r.id);
    expect(summary).toMatchObject({
      status: "COMPLETED", isLatest: true, asOfDate: today, horizonDays: 60, plannedOrderCount: 3, materialsPlanned: 3,
      parameters: { includeForecast: true, respectSafetyStock: true },
    });
    expect(r.runNumber).toMatch(/^MRP-\d{4}-0001$/);
    expect(summary.inputHash).toMatch(/^[0-9a-f]{64}$/);

    const orders = await listPlannedOrders(f.companyId, "latest", {});
    const by = Object.fromEntries(orders.map((o) => [o.material.code, o]));
    expect(by["FG-T1"]).toMatchObject({ type: "PRODUCTION", quantity: 200, releaseDate: addDays(today, 18), requiredDate: addDays(today, 20), demands: [`SO-MRP-${f.tag}`] });
    expect(by["RM-T1"]).toMatchObject({ type: "PURCHASE", quantity: 150, requiredDate: addDays(today, 18), releaseDate: addDays(today, 11), vendor: { code: "SUP-T1" }, leadTimeSource: "VENDOR:SUP-T1" });
    expect(by["PM-T1"]).toMatchObject({ type: "PURCHASE", quantity: 150, releaseDate: addDays(today, 13) });

    // Pegging up and component demand down.
    const fg = await getPlannedOrder(f.companyId, by["FG-T1"].id);
    expect(fg.pegging).toEqual([expect.objectContaining({ demandSourceType: "SALES_ORDER", quantity: 200 })]);
    expect(fg.components.map((c) => [c.material, c.quantity]).sort()).toEqual([["PM-T1", 150], ["RM-T1", 102]]);
    const rm = await getPlannedOrder(f.companyId, by["RM-T1"].id);
    expect(rm.pegging[0]).toMatchObject({ demandSourceType: "DEPENDENT", quantity: 102, parent: { material: "FG-T1", quantity: 200 } });
    expect(rm.explanation?.steps).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Net requirement", value: 102 })]));

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { mrpRunId: r.id, action: "MRP_RUN" } });
    expect(audit.userId).toBe(planner.userId);
  });

  it("summarises requirements per material and exposes the time-phased record", async () => {
    const rows = await materialRequirements(f.companyId, runId);
    const pm = rows.find((r) => r.material.code === "PM-T1")!;
    expect(pm).toMatchObject({ openingStock: 50, grossRequirement: 200, scheduledReceipts: 0, netRequirement: 150, plannedReceipts: 150, status: "short", coverDays: 18, nextPlannedRelease: addDays(today, 13) });
    // A planned purchase carries its suggested vendor's list price, when one is on file.
    const vm = await prisma.vendorMaterial.findFirstOrThrow({ where: { vendorId: f.vendor.id, materialId: f.pack.id } });
    await prisma.vendorMaterial.update({ where: { id: vm.id }, data: { unitPrice: D(12.5) } });
    const buys = await listPlannedOrders(f.companyId, runId, { type: "PURCHASE", materialId: f.pack.id });
    expect(buys[0].price).toEqual({ unitPrice: 12.5, currencyCode: "INR" });
    await prisma.vendorMaterial.update({ where: { id: vm.id }, data: { unitPrice: vm.unitPrice } });
    const record = await timePhased(f.companyId, runId, f.pack.id, f.plant.id);
    expect(record.find((r) => r.bucketStart === addDays(today, 18))).toMatchObject({ grossRequirement: 200, netRequirement: 150, plannedReceipt: 150, projectedOnHand: 0 });
    expect(record.find((r) => r.bucketStart === addDays(today, 13))).toMatchObject({ plannedRelease: 150 });
  });

  it("runs one at a time per company, and recovers from a run a crash abandoned", async () => {
    const inFlight = await prisma.mrpRun.create({
      data: { companyId: f.companyId, runNumber: `MRP-HELD-${f.tag}`, status: "RUNNING", asOfDate: new Date(), horizonDays: 30, triggeredById: planner.userId, startedAt: new Date() },
    });
    expect((await failure(run())).message).toMatch(/MRP-HELD-.* is still running/);

    // Ten minutes on, it is presumed dead: the next run marks it failed and proceeds.
    await prisma.mrpRun.update({ where: { id: inFlight.id }, data: { startedAt: new Date(Date.now() - 11 * 60_000) } });
    await run();
    expect(await prisma.mrpRun.findUniqueOrThrow({ where: { id: inFlight.id } })).toMatchObject({ status: "FAILED", errorMessage: expect.stringMatching(/Abandoned/) });

    // Concurrent requests: whatever interleaving, never two RUNNING at once and nothing left RUNNING.
    const results = await Promise.allSettled([run(), run()]);
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) expect(r.reason.message).toMatch(/is still running/);
    expect(await prisma.mrpRun.count({ where: { companyId: f.companyId, status: "RUNNING" } })).toBe(0);
  });

  it("does not let another company read the run", async () => {
    const other = await createFixture();
    try {
      expect((await failure(getRun(other.companyId, runId))).status).toBe(404);
    } finally {
      await other.destroy();
    }
  });
});

describe("conversion", () => {
  it("turns the latest plan into one draft PO per vendor and a work order, all at once", async () => {
    const latest = await run();
    const orders = await listPlannedOrders(f.companyId, latest.id, {});
    const result = await convertPlannedOrders(latest.id, orders.map((o) => o.id), f.ctx(planner));

    expect(result.purchaseOrders).toHaveLength(1);
    expect(result.purchaseOrders[0].lines).toBe(2);
    expect(result.workOrders).toHaveLength(1);

    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.purchaseOrders[0].id }, include: { lines: { include: { material: true } } } });
    expect(po).toMatchObject({ status: "DRAFT", vendorId: f.vendor.id, notes: `Raised from ${latest.runNumber}` });
    expect(Object.fromEntries(po.lines.map((l) => [l.material.code, l.orderedQty.toNumber()]))).toEqual({ "RM-T1": 150, "PM-T1": 150 });
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: result.workOrders[0].id }, include: { components: true } });
    expect(wo.plannedQty.toNumber()).toBe(200);
    expect(wo.components).toHaveLength(2);

    const after = await listPlannedOrders(f.companyId, latest.id, {});
    expect(after.every((o) => o.status === "CONVERTED" && o.convertedTo?.number)).toBe(true);

    // Converting again is refused; the next run sees the new orders as supply.
    expect((await failure(convertPlannedOrders(latest.id, [orders[0].id], f.ctx(planner)))).message).toMatch(/cannot be converted/);
    const next = await run();
    expect((await getRun(f.companyId, next.id)).plannedOrderCount).toBe(0);
    expect((await failure(convertPlannedOrders(latest.id, [orders[0].id], f.ctx(planner)))).message).toMatch(/superseded/);
  });

  it("needs the rights to create what it converts into", async () => {
    const readOnly = await f.actor(["mrp:read", "mrp:run"], "RunOnly");
    await prisma.salesOrderLine.updateMany({ where: { salesOrder: { companyId: f.companyId } }, data: { quantity: D(400) } });
    const r = await run();
    const orders = await listPlannedOrders(f.companyId, r.id, { type: "PRODUCTION" });
    const e = await failure(convertPlannedOrders(r.id, [orders[0].id], f.ctx(readOnly)));
    expect(e.status).toBe(403);
    // Nothing half-done.
    expect((await listPlannedOrders(f.companyId, r.id, { type: "PRODUCTION" }))[0].status).toBe("PLANNED");
  });

  it("flags production with no active BOM as unconvertible, and refuses it line by line", async () => {
    await prisma.salesOrderLine.updateMany({ where: { salesOrder: { companyId: f.companyId } }, data: { quantity: D(400) } });
    await prisma.bomVersion.updateMany({ where: { bom: { companyId: f.companyId, materialId: f.finished.id } }, data: { isActive: false } });
    try {
      const r = await run();
      const make = (await listPlannedOrders(f.companyId, r.id, { type: "PRODUCTION", materialId: f.finished.id }))[0];
      expect(make.blocker).toMatch(/no active BOM/i);
      const e = await failure(convertPlannedOrders(r.id, [make.id], f.ctx(planner)));
      expect(e.status).toBe(422);
      expect(e.details?.[0]).toMatchObject({ path: "plannedOrderIds.0", message: expect.stringMatching(/no active BOM/) });
    } finally {
      await prisma.bomVersion.updateMany({ where: { bom: { companyId: f.companyId, materialId: f.finished.id } }, data: { isActive: true } });
    }
  });

  it("lets procurement convert purchases without the right to run MRP, but not production", async () => {
    const buyer = await f.actor(["mrp:read", "purchase-order:create"], "Buyer");
    await prisma.salesOrderLine.updateMany({ where: { salesOrder: { companyId: f.companyId } }, data: { quantity: D(400) } });
    const r = await run();
    const make = await listPlannedOrders(f.companyId, r.id, { type: "PRODUCTION" });
    const buy = (await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE" })).filter((o) => o.vendor);
    expect(buy.length).toBeGreaterThan(0);
    expect((await failure(convertPlannedOrders(r.id, [make[0].id, buy[0].id], f.ctx(buyer)))).status).toBe(403);
    const done = await convertPlannedOrders(r.id, [buy[0].id], f.ctx(buyer));
    expect(done.purchaseOrders).toHaveLength(1);
    expect(done.workOrders).toHaveLength(0);
    // Leave no new supply behind for the tests that follow.
    const poId = done.purchaseOrders[0].id;
    await prisma.plannedOrder.updateMany({ where: { convertedToPurchaseOrderId: poId }, data: { convertedToPurchaseOrderId: null } });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: poId } });
    await prisma.purchaseOrder.delete({ where: { id: poId } });
  });
});

describe("exceptions", () => {
  it("records problems with the plan and lets a planner resolve them", async () => {
    // Remove the vendor → purchased materials have no supplier.
    await prisma.vendorMaterial.updateMany({ where: { vendorId: f.vendor.id }, data: { isActive: false } });
    try {
      const r = await run();
      const list = await listExceptions(f.companyId, r.id);
      const missing = list.filter((e) => e.type === "MISSING_VENDOR");
      expect(missing.map((e) => e.material?.code).sort()).toEqual(["PM-T1", "RM-T1"]);
      await resolveException(missing[0].id, f.ctx(planner));
      const again = await listExceptions(f.companyId, r.id);
      expect(again.find((e) => e.id === missing[0].id)?.isResolved).toBe(true);
      expect((await failure(resolveException(missing[0].id, f.ctx(planner)))).status).toBe(409);
    } finally {
      await prisma.vendorMaterial.updateMany({ where: { vendorId: f.vendor.id }, data: { isActive: true } });
    }
  });
});

describe("simulations", () => {
  it("plan from another date only when asked, and never become the plan", async () => {
    const past = addDays(today, -30);
    // A planning run cannot be backdated.
    expect((await failure(run({ asOfDate: past }))).status).toBe(422);

    const plan = await run();
    const sim = await run({ asOfDate: past, simulation: true });
    expect(await prisma.mrpRun.findUniqueOrThrow({ where: { id: sim.id } }))
      .toMatchObject({ isSimulation: true, status: "COMPLETED", asOfDate: new Date(`${past}T00:00:00Z`) });

    // Newer, but the plan is still the planning run, and the what-if cannot be ordered from.
    expect((await getRun(f.companyId, "latest")).id).toBe(plan.id);
    const orders = await listPlannedOrders(f.companyId, sim.id, {});
    const e = await failure(convertPlannedOrders(sim.id, [orders[0]?.id ?? "none"], f.ctx(planner)));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/simulation/);
  });
});
