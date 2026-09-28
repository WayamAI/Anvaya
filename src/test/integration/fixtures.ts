import { randomUUID } from "node:crypto";
import { MaterialKind, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import type { WriteContext } from "@/server/services/write-context";

/**
 * A throwaway company for integration tests: two locations, units, a
 * batch-tracked raw material with a shelf life, an untracked packaging item,
 * a finished good, an approved and an unapproved vendor, a customer, and
 * actors with whatever permissions a test asks for.
 *
 * Every row hangs off the company, and `destroy()` removes them in dependency
 * order (the schema restricts deletes of anything with history).
 */

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export async function createFixture() {
  const tag = randomUUID().slice(0, 8).toUpperCase();
  const company = await prisma.company.create({
    data: { code: `IT-${tag}`, name: `Integration ${tag}`, timezone: "Asia/Kolkata", currencyCode: "INR" },
  });
  const companyId = company.id;

  const [plant, warehouse] = await Promise.all([
    prisma.location.create({ data: { companyId, code: "PLANT", name: "Test Plant", type: "PLANT", isManufacturing: true } }),
    prisma.location.create({ data: { companyId, code: "WH", name: "Test Warehouse", type: "WAREHOUSE" } }),
  ]);
  const [kg, pcs] = await Promise.all([
    prisma.unitOfMeasure.create({ data: { companyId, code: "KG", name: "Kilogram", dimension: "MASS" } }),
    prisma.unitOfMeasure.create({ data: { companyId, code: "PCS", name: "Pieces", dimension: "COUNT" } }),
  ]);
  const [raw, pack, finished] = await Promise.all([
    prisma.material.create({
      data: { companyId, code: "RM-T1", name: "Test Surfactant", kind: MaterialKind.RAW, unitOfMeasureId: kg.id,
        standardCost: D(10), shelfLifeDays: 365, isBatchTracked: true },
    }),
    prisma.material.create({
      data: { companyId, code: "PM-T1", name: "Test Bottle", kind: MaterialKind.PACKAGING, unitOfMeasureId: pcs.id,
        standardCost: D(2), isBatchTracked: false },
    }),
    prisma.material.create({
      data: { companyId, code: "FG-T1", name: "Test Detergent", kind: MaterialKind.FINISHED, unitOfMeasureId: pcs.id,
        standardCost: D(50), shelfLifeDays: 730, isBatchTracked: true },
    }),
  ]);
  const [vendor, unapprovedVendor] = await Promise.all([
    prisma.vendor.create({ data: { companyId, code: "SUP-T1", name: "Approved Chemicals", isApproved: true } }),
    prisma.vendor.create({ data: { companyId, code: "SUP-T2", name: "New Supplier", isApproved: false } }),
  ]);
  await prisma.vendorMaterial.createMany({
    data: [
      { vendorId: vendor.id, materialId: raw.id, leadTimeDays: 7, unitPrice: D(12), isPreferred: true },
      { vendorId: vendor.id, materialId: pack.id, leadTimeDays: 5, unitPrice: D(2.5) },
      { vendorId: unapprovedVendor.id, materialId: raw.id, leadTimeDays: 10, unitPrice: D(11) },
    ],
  });
  const customer = await prisma.customer.create({ data: { companyId, code: "CUST-T1", name: "Test Retailer" } });

  const users = new Map<string, string>();
  async function actor(permissions: string[], name = "Tester"): Promise<Actor> {
    let userId = users.get(name);
    if (!userId) {
      const u = await prisma.user.create({
        data: { companyId, email: `${name.toLowerCase().replace(/\W/g, "")}-${tag}@test.local`, name, passwordHash: "x" },
      });
      userId = u.id;
      users.set(name, userId);
    }
    return {
      userId, companyId, email: `${name}@test.local`, name, sessionId: randomUUID(), roles: ["TEST"],
      permissions: new Set(permissions),
    };
  }

  function ctx(a: Actor): WriteContext {
    return { actor: a, requestId: randomUUID(), clientInfo: { ipAddress: "127.0.0.1", userAgent: "vitest" } };
  }

  async function balance(materialId: string, locationId = plant.id) {
    const b = await prisma.inventoryBalance.findUnique({ where: { materialId_locationId: { materialId, locationId } } });
    return b
      ? { onHand: b.onHandQty.toNumber(), held: b.quarantineQty.toNumber(), value: b.valuation.toNumber(), reserved: b.reservedQty.toNumber() }
      : { onHand: 0, held: 0, value: 0, reserved: 0 };
  }

  async function destroy() {
    const materialIds = [raw.id, pack.id, finished.id];
    const materialScope = { materialId: { in: materialIds } };
    // MRP results restrict material deletes; they go first (children cascade).
    await prisma.mrpRun.deleteMany({ where: { companyId } });
    await prisma.demandForecast.deleteMany({ where: { companyId } });
    await prisma.auditLog.deleteMany({ where: { companyId } });
    await prisma.idempotencyKey.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.stockMovement.deleteMany({ where: materialScope });
    await prisma.inventoryAdjustment.deleteMany({ where: materialScope });
    await prisma.goodsReceiptLine.deleteMany({ where: materialScope });
    await prisma.goodsReceipt.deleteMany({ where: { companyId } });
    await prisma.workOrderComponent.deleteMany({ where: { workOrder: { companyId } } });
    await prisma.workOrderOperation.deleteMany({ where: { workOrder: { companyId } } });
    await prisma.workOrder.deleteMany({ where: { companyId } });
    await prisma.inventoryLot.deleteMany({ where: materialScope });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { companyId } } });
    await prisma.purchaseOrder.deleteMany({ where: { companyId } });
    await prisma.salesOrderLine.deleteMany({ where: { salesOrder: { companyId } } });
    await prisma.salesOrder.deleteMany({ where: { companyId } });
    await prisma.bomComponent.deleteMany({ where: { bomVersion: { bom: { companyId } } } });
    await prisma.bomVersion.deleteMany({ where: { bom: { companyId } } });
    await prisma.bom.deleteMany({ where: { companyId } });
    await prisma.inventoryBalance.deleteMany({ where: materialScope });
    await prisma.materialLocationPolicy.deleteMany({ where: materialScope });
    await prisma.vendorMaterial.deleteMany({ where: materialScope });
    await prisma.session.deleteMany({ where: { user: { companyId } } });
    await prisma.userRole.deleteMany({ where: { user: { companyId } } });
    await prisma.company.delete({ where: { id: companyId } });
  }

  return {
    tag, company, companyId, plant, warehouse, kg, pcs, raw, pack, finished, vendor, unapprovedVendor, customer,
    actor, ctx, balance, destroy,
  };
}
