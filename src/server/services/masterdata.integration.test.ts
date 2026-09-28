import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { runInTransaction } from "@/server/db/transaction";
import { getSetting } from "@/server/config/company-settings";
import { AppError } from "@/server/errors/app-error";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { adjustStock } from "./inventory-adjustment.service";
import {
  createCustomer, createLocation, createMaterial, updateCustomer, updateLocation, updateMaterial, updateSettings, updateVendor,
  upsertPolicy, upsertVendorMaterial,
} from "./master-data.service";
import { activateBomVersion, createBom, createBomVersion, deleteBomVersion } from "./bom-write.service";
import type { AdjustmentInput } from "@/server/validation/inventory";
import { createMaterialBody } from "@/server/validation/masterdata";

/** Stock adjustments, master data guards, BOM versions and settings against Postgres. */

let f: Fixture;
let admin: Awaited<ReturnType<Fixture["actor"]>>;
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

const adjust = (input: AdjustmentInput) => runInTransaction((tx) => adjustStock(tx, input, f.ctx(admin)));

beforeAll(async () => {
  f = await createFixture();
  const all = await prisma.permission.findMany({ select: { code: true } });
  admin = await f.actor(all.map((p) => p.code), "Admin");
});

afterAll(async () => {
  await prisma.materialCategory.deleteMany({ where: { companyId: f.companyId } });
  await f?.destroy();
  await prisma.$disconnect();
});

describe("stock adjustments", () => {
  it("counts untracked stock to the book, both ways, at the average cost", async () => {
    await prisma.inventoryBalance.create({ data: { materialId: f.pack.id, locationId: f.plant.id, onHandQty: D(100), valuation: D(250) } });
    const loss = await adjust({ materialId: f.pack.id, locationId: f.plant.id, countedQty: 90, reason: "CYCLE_COUNT" });
    expect(loss).toMatchObject({ bookQty: 100, countedQty: 90, delta: -10, unitCost: 2.5 });
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 90, value: 225 });

    const found = await adjust({ materialId: f.pack.id, locationId: f.plant.id, countedQty: 95, reason: "FOUND" });
    expect(found.delta).toBe(5);
    expect(await f.balance(f.pack.id)).toMatchObject({ onHand: 95, value: 237.5 });

    const rows = await prisma.inventoryAdjustment.findMany({ where: { materialId: f.pack.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.quantityBefore.toNumber(), r.quantityAfter.toNumber(), r.reason])).toEqual([[100, 90, "CYCLE_COUNT"], [90, 95, "FOUND"]]);
    expect(await prisma.stockMovement.count({ where: { materialId: f.pack.id, type: "ADJUSTMENT" } })).toBe(2);
  });

  it("re-states rather than re-applies: a repeated count changes nothing", async () => {
    const e = await failure(adjust({ materialId: f.pack.id, locationId: f.plant.id, countedQty: 95, reason: "CYCLE_COUNT" }));
    expect(e.message).toMatch(/matches the book/);
  });

  it("counts batch-tracked stock per lot, keeping the lot and balance in step", async () => {
    const lot = await prisma.inventoryLot.create({
      data: { materialId: f.raw.id, locationId: f.plant.id, lotNumber: `${f.tag}-ADJ`, receivedQty: D(40), remainingQty: D(40), receiptDate: new Date(), qcStatus: "APPROVED" },
    });
    await prisma.inventoryBalance.create({ data: { materialId: f.raw.id, locationId: f.plant.id, onHandQty: D(40), valuation: D(400) } });

    expect((await failure(adjust({ materialId: f.raw.id, locationId: f.plant.id, countedQty: 1, reason: "CYCLE_COUNT" }))).details)
      .toEqual([{ path: "lotId", message: "is required for a batch-tracked material" }]);

    await adjust({ materialId: f.raw.id, locationId: f.plant.id, lotId: lot.id, countedQty: 37, reason: "DAMAGE", notes: "Torn bag" });
    await adjust({ materialId: f.raw.id, locationId: f.plant.id, lotId: lot.id, countedQty: 38, reason: "FOUND" });
    const row = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(row.remainingQty.toNumber()).toBe(38);
    expect((await f.balance(f.raw.id)).onHand).toBe(38);
  });

  it("needs inventory:adjust", async () => {
    const viewer = await f.actor(["inventory:read"], "Viewer");
    const e = await failure(runInTransaction((tx) => adjustStock(tx, { materialId: f.pack.id, locationId: f.plant.id, countedQty: 1, reason: "LOSS" }, f.ctx(viewer))));
    expect(e.status).toBe(403);
  });
});

describe("materials", () => {
  it("creates with a permanent unique code and audits it", async () => {
    // Codes are normalised by the request schema, as at the route.
    const body = createMaterialBody.parse({ code: " rm-new-1 ", name: "New resin", kind: "RAW", unitOfMeasureId: f.kg.id, isBatchTracked: true });
    const m = await createMaterial(body, f.ctx(admin));
    expect(m.code).toBe("RM-NEW-1");
    expect((await failure(createMaterial({ code: "RM-NEW-1", name: "Dup", kind: "RAW", unitOfMeasureId: f.kg.id, isBatchTracked: false }, f.ctx(admin)))).status).toBe(409);
    expect(await prisma.auditLog.count({ where: { entityId: m.id, action: "CREATE" } })).toBe(1);
  });

  it("freezes unit, batch tracking and standard cost once there is stock", async () => {
    expect((await failure(updateMaterial(f.pack.id, { isBatchTracked: true }, f.ctx(admin)))).message).toMatch(/stock history/);
    expect((await failure(updateMaterial(f.pack.id, { standardCost: 9 }, f.ctx(admin)))).message).toMatch(/moving average/);
    await updateMaterial(f.pack.id, { name: "Test bottle 500 ml", shelfLifeDays: 1000 }, f.ctx(admin));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.pack.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(audit.newValues).toMatchObject({ name: "Test bottle 500 ml", shelfLifeDays: 1000 });
  });

  it("will not deactivate a material that still has stock", async () => {
    expect((await failure(updateMaterial(f.pack.id, { isActive: false }, f.ctx(admin)))).message).toMatch(/still in use: 95 on hand/);
  });

  it("saves a planning policy and refuses MAKE at a warehouse", async () => {
    const policy = { procurementType: "BUY" as const, safetyStock: 50, reorderPoint: 80, lotSizingRule: "LOT_FOR_LOT" as const,
      minOrderQty: 0, maxOrderQty: null, orderMultiple: 0, periodDays: null, productionLeadTimeDays: 0, safetyLeadTimeDays: 2,
      averageDailyDemand: 10, demandStdDev: 3, serviceLevel: 0.95, abcClass: "A" as const, isActive: true };
    await upsertPolicy(f.pack.id, f.plant.id, policy, f.ctx(admin));
    await upsertPolicy(f.pack.id, f.plant.id, { ...policy, safetyStock: 60 }, f.ctx(admin));
    const row = await prisma.materialLocationPolicy.findUniqueOrThrow({ where: { materialId_locationId: { materialId: f.pack.id, locationId: f.plant.id } } });
    expect(row.safetyStock.toNumber()).toBe(60);
    expect((await failure(upsertPolicy(f.finished.id, f.warehouse.id, { ...policy, procurementType: "MAKE" }, f.ctx(admin)))).message).toMatch(/not a manufacturing location/);
  });
});

describe("vendors, customers and locations", () => {
  it("keeps one preferred vendor per material", async () => {
    await upsertVendorMaterial(f.unapprovedVendor.id, f.raw.id, { leadTimeDays: 4, unitPrice: 11, minOrderQty: 0, orderMultiple: 0, isPreferred: true, isActive: true }, f.ctx(admin));
    const rows = await prisma.vendorMaterial.findMany({ where: { materialId: f.raw.id } });
    expect(rows.filter((r) => r.isPreferred).map((r) => r.vendorId)).toEqual([f.unapprovedVendor.id]);
  });

  it("records Approved Supplier List changes as approvals", async () => {
    await updateVendor(f.unapprovedVendor.id, { isApproved: true }, f.ctx(admin));
    expect(await prisma.auditLog.count({ where: { entityId: f.unapprovedVendor.id, action: "APPROVE" } })).toBe(1);
  });

  it("will not deactivate a customer with open orders or a location holding stock", async () => {
    const c = await createCustomer({ code: "CUST-X", name: "X Retail", type: "ECOMMERCE" }, f.ctx(admin));
    await prisma.salesOrder.create({
      data: { companyId: f.companyId, orderNumber: `SO-X-${f.tag}`, customerId: c.id, orderDate: new Date(), requiredDate: new Date(), status: "CONFIRMED" },
    });
    expect((await failure(updateCustomer(c.id, { isActive: false }, f.ctx(admin)))).message).toMatch(/1 open sales order/);
    expect((await failure(updateLocation(f.plant.id, { isActive: false }, f.ctx(admin)))).message).toMatch(/stock on hand/);

    const depot = await createLocation({ code: "DEPOT-9", name: "Depot 9", type: "DEPOT", isManufacturing: false }, f.ctx(admin));
    await updateLocation(depot.id, { isActive: false }, f.ctx(admin));
  });
});

describe("BOM versions", () => {
  it("creates, activates and retires versions, refusing cycles and history deletion", async () => {
    const bom = await createBom({ materialId: f.finished.id, code: "BOM-T", name: "Test" }, f.ctx(admin));
    const a = await createBomVersion(bom.id, {
      version: "A", baseQuantity: 100, effectiveFrom: "2026-01-01",
      components: [{ materialId: f.raw.id, quantity: 50, scrapFactor: 0.02 }, { materialId: f.pack.id, quantity: 100 }],
    }, f.ctx(admin));
    await activateBomVersion(bom.id, a.id, f.ctx(admin));

    // Wrong dimension (kg for a counted item) and self-reference are refused.
    const bad = await failure(createBomVersion(bom.id, {
      version: "X", baseQuantity: 1, effectiveFrom: "2026-01-01",
      components: [{ materialId: f.pack.id, quantity: 1, unitOfMeasureId: f.kg.id }, { materialId: f.finished.id, quantity: 1 }],
    }, f.ctx(admin)));
    expect(bad.details?.map((d) => d.message)).toEqual([expect.stringMatching(/KG is MASS; PM-T1 is stocked by COUNT/), "a product cannot be its own component"]);

    // Making the raw material from the finished good would loop.
    const intermediate = await createMaterial({ code: "SA-LOOP", name: "Loop", kind: "SEMI_FINISHED", unitOfMeasureId: f.kg.id, isBatchTracked: false }, f.ctx(admin));
    const sa = await createBom({ materialId: intermediate.id, code: "BOM-SA-LOOP", name: "Loop" }, f.ctx(admin));
    const loop = await createBomVersion(sa.id, { version: "A", baseQuantity: 1, effectiveFrom: "2026-01-01", components: [{ materialId: f.finished.id, quantity: 1 }] }, f.ctx(admin));
    await activateBomVersion(sa.id, loop.id, f.ctx(admin));
    const b = await createBomVersion(bom.id, { version: "B", baseQuantity: 100, effectiveFrom: "2026-06-01", components: [{ materialId: intermediate.id, quantity: 1 }] }, f.ctx(admin));
    expect((await failure(activateBomVersion(bom.id, b.id, f.ctx(admin)))).message).toMatch(/FG-T1 a component of itself: FG-T1 → SA-LOOP → FG-T1/);

    const c = await createBomVersion(bom.id, { version: "C", baseQuantity: 100, effectiveFrom: "2026-06-01", components: [{ materialId: f.raw.id, quantity: 45 }] }, f.ctx(admin));
    await activateBomVersion(bom.id, c.id, f.ctx(admin));
    const versions = await prisma.bomVersion.findMany({ where: { bomId: bom.id }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.isActive, v.effectiveTo !== null])).toEqual([["A", false, true], ["B", false, false], ["C", true, false]]);

    await deleteBomVersion(bom.id, b.id, f.ctx(admin));
    expect((await failure(deleteBomVersion(bom.id, c.id, f.ctx(admin)))).message).toMatch(/active version cannot be deleted/);
  });
});

describe("settings", () => {
  it("stores typed settings the write services read", async () => {
    await updateSettings({ "purchasing.overReceiptTolerancePct": 5, "purchasing.allowSelfApproval": false }, f.ctx(admin));
    expect(await getSetting(f.companyId, "purchasing.overReceiptTolerancePct")).toBe(5);
    expect(await getSetting(f.companyId, "purchasing.allowSelfApproval")).toBe(false);
    expect(await prisma.auditLog.count({ where: { companyId: f.companyId, entityType: "company_settings" } })).toBe(2);
    await prisma.companySetting.deleteMany({ where: { companyId: f.companyId } });
  });
});
