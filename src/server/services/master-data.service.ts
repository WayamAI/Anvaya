import { AuditAction, Prisma } from "@prisma/client";
import { recordAudit, diffValues } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { lockRow, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { OPEN_PO_STATUSES } from "@/server/purchasing/purchase-orders";
import type {
  CreateCategoryInput, CreateCustomerInput, CreateLocationInput, CreateMaterialInput, CreateUnitInput, CreateVendorInput,
  PolicyInput, UpdateCustomerInput, UpdateLocationInput, UpdateMaterialInput, UpdateSettingsInput, UpdateVendorInput,
  VendorMaterialInput,
} from "@/server/validation/masterdata";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Master data — write side.
 *
 * Bodies arrive schema-validated; the `as Prisma.…CreateInput` casts below
 * only bridge zod's inferred optionals under this repo's non-strict tsconfig.
 *
 * Codes are business keys and never change once created: documents,
 * reports and people refer to "RM-4023", so a rename would silently break
 * every reference outside the database. Anything else can be edited, with
 * these guards where history depends on a field:
 *
 * - A material's unit and batch tracking are fixed once it has any stock
 *   movement: existing quantities and lots are in that unit and that mode.
 * - Its standard cost can only be set by hand while nothing is on hand;
 *   after that it is the moving average the ledger maintains.
 * - Nothing can be deactivated while it is still in use — stock on hand or
 *   open orders — because an inactive record cannot be ordered, received or
 *   shipped, which would strand them.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const OPEN_SO = ["CONFIRMED", "PROCESSING"] as const;
const OPEN_WO = ["PLANNED", "FIRMED", "RELEASED", "IN_PROGRESS"] as const;

async function audit(tx: Tx, ctx: WriteContext, action: AuditAction, entityType: string, entityId: string, label: string, previous?: unknown, next?: unknown) {
  await recordAudit({ ...auditMeta(ctx), tx, action, entityType, entityId, entityLabel: label, previousValues: previous, newValues: next });
}

async function assertUniqueCode(tx: Tx, model: "material" | "vendor" | "customer" | "location" | "materialCategory" | "unitOfMeasure", companyId: string, code: string) {
  // Prisma's delegates share findFirst's shape; the cast keeps this one helper.
  const clash = await (tx[model] as unknown as { findFirst: (a: unknown) => Promise<unknown> })
    .findFirst({ where: { companyId, code }, select: { id: true } });
  if (clash) throw AppError.conflict(`The code ${code} is already in use`, { code });
}

function refuseInUse(problems: string[], what: string) {
  if (problems.length) throw AppError.conflict(`${what} is still in use: ${problems.join("; ")}`);
}

/* ---- Materials ------------------------------------------------------------------ */

async function checkMaterialRefs(tx: Tx, companyId: string, input: { categoryId?: string | null; unitOfMeasureId?: string }) {
  const problems: ErrorDetail[] = [];
  if (input.categoryId) {
    if (!(await tx.materialCategory.findFirst({ where: { id: input.categoryId, companyId }, select: { id: true } }))) {
      problems.push({ path: "categoryId", message: "not found" });
    }
  }
  if (input.unitOfMeasureId) {
    if (!(await tx.unitOfMeasure.findFirst({ where: { id: input.unitOfMeasureId, companyId }, select: { id: true } }))) {
      problems.push({ path: "unitOfMeasureId", message: "not found" });
    }
  }
  if (problems.length) throw AppError.unprocessable("Some references do not exist", problems);
}

export async function createMaterial(input: CreateMaterialInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "material:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "material", companyId, input.code);
    await checkMaterialRefs(tx, companyId, input);
    const m = await tx.material.create({
      data: {
        companyId, code: input.code, name: input.name, description: input.description ?? null, kind: input.kind,
        categoryId: input.categoryId ?? null, unitOfMeasureId: input.unitOfMeasureId,
        standardCost: input.standardCost !== undefined ? D(input.standardCost) : null,
        shelfLifeDays: input.shelfLifeDays ?? null, isBatchTracked: input.isBatchTracked ?? false,
      },
      select: { id: true, code: true },
    });
    await audit(tx, ctx, AuditAction.CREATE, "materials", m.id, m.code, undefined, input);
    return m;
  });
}

export async function updateMaterial(id: string, input: UpdateMaterialInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "material:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "materials", id, companyId))) throw AppError.notFound("Material", id);
    const m = await tx.material.findUniqueOrThrow({ where: { id } });
    await checkMaterialRefs(tx, companyId, input);

    const structural = (input.unitOfMeasureId !== undefined && input.unitOfMeasureId !== m.unitOfMeasureId) ||
      (input.isBatchTracked !== undefined && input.isBatchTracked !== m.isBatchTracked);
    if (structural && (await tx.stockMovement.count({ where: { materialId: id } })) > 0) {
      throw AppError.conflict(`${m.code} has stock history; its unit and batch tracking can no longer change`);
    }
    if (input.standardCost !== undefined) {
      const onHand = await tx.inventoryBalance.aggregate({ where: { materialId: id }, _sum: { onHandQty: true } });
      if (onHand._sum.onHandQty?.gt(0)) {
        throw AppError.conflict(`${m.code} has stock on hand; its cost is the moving average of receipts and cannot be set by hand`);
      }
    }
    if (input.isActive === false && m.isActive) {
      const [stock, poLines, soLines, woAsProduct, woAsComponent, bomUse] = await Promise.all([
        tx.inventoryBalance.aggregate({ where: { materialId: id }, _sum: { onHandQty: true } }),
        tx.purchaseOrderLine.count({ where: { materialId: id, purchaseOrder: { status: { in: [...OPEN_PO_STATUSES, "DRAFT"] } } } }),
        tx.salesOrderLine.count({ where: { materialId: id, salesOrder: { status: { in: [...OPEN_SO] } } } }),
        tx.workOrder.count({ where: { materialId: id, status: { in: [...OPEN_WO] } } }),
        tx.workOrderComponent.count({ where: { materialId: id, workOrder: { status: { in: [...OPEN_WO] } } } }),
        tx.bomComponent.count({ where: { materialId: id, isOptional: false, bomVersion: { isActive: true } } }),
      ]);
      refuseInUse([
        stock._sum.onHandQty?.gt(0) ? `${stock._sum.onHandQty} on hand` : "",
        poLines ? `${poLines} open purchase order line(s)` : "",
        soLines ? `${soLines} open sales order line(s)` : "",
        woAsProduct + woAsComponent ? `${woAsProduct + woAsComponent} open work order(s)` : "",
        bomUse ? `a component of ${bomUse} active BOM version(s)` : "",
      ].filter(Boolean), m.code);
    }

    const data = {
      name: input.name, description: input.description, kind: input.kind, categoryId: input.categoryId,
      unitOfMeasureId: input.unitOfMeasureId, standardCost: input.standardCost !== undefined ? D(input.standardCost) : undefined,
      shelfLifeDays: input.shelfLifeDays, isBatchTracked: input.isBatchTracked, isActive: input.isActive,
    };
    await tx.material.update({ where: { id }, data });
    const diff = diffValues(m as unknown as Record<string, unknown>, data as Record<string, unknown>);
    if (diff) await audit(tx, ctx, AuditAction.UPDATE, "materials", id, m.code, diff.previous, diff.next);
  });
}

export async function upsertPolicy(materialId: string, locationId: string, input: PolicyInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "material:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    const [m, l] = await Promise.all([
      tx.material.findFirst({ where: { id: materialId, companyId }, select: { code: true } }),
      tx.location.findFirst({ where: { id: locationId, companyId }, select: { code: true, isManufacturing: true } }),
    ]);
    if (!m) throw AppError.notFound("Material", materialId);
    if (!l) throw AppError.notFound("Location", locationId);
    if (input.procurementType === "MAKE" && !l.isManufacturing) {
      throw AppError.unprocessable(`${l.code} is not a manufacturing location; ${m.code} cannot be made there`, [{ path: "procurementType", message: "MAKE needs a manufacturing location" }]);
    }
    const dec = (v: number | null) => (v === null ? null : D(v));
    const data = {
      procurementType: input.procurementType, safetyStock: D(input.safetyStock), reorderPoint: D(input.reorderPoint),
      lotSizingRule: input.lotSizingRule, minOrderQty: D(input.minOrderQty), maxOrderQty: dec(input.maxOrderQty),
      orderMultiple: D(input.orderMultiple), periodDays: input.periodDays, productionLeadTimeDays: input.productionLeadTimeDays,
      safetyLeadTimeDays: input.safetyLeadTimeDays, averageDailyDemand: dec(input.averageDailyDemand),
      demandStdDev: dec(input.demandStdDev), serviceLevel: dec(input.serviceLevel), abcClass: input.abcClass, isActive: input.isActive,
    };
    const before = await tx.materialLocationPolicy.findUnique({ where: { materialId_locationId: { materialId, locationId } } });
    const row = await tx.materialLocationPolicy.upsert({
      where: { materialId_locationId: { materialId, locationId } },
      create: { materialId, locationId, ...data },
      update: data,
      select: { id: true },
    });
    const diff = before ? diffValues(before as unknown as Record<string, unknown>, data as Record<string, unknown>) : null;
    await audit(tx, ctx, before ? AuditAction.UPDATE : AuditAction.CREATE, "material_location_policies", row.id, `${m.code}@${l.code}`,
      diff?.previous, diff?.next ?? input);
  });
}

export async function createCategory(input: CreateCategoryInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "material:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "materialCategory", companyId, input.code);
    if (input.parentId && !(await tx.materialCategory.findFirst({ where: { id: input.parentId, companyId, parentId: null } }))) {
      throw AppError.unprocessable("The parent category does not exist or is itself a sub-category", [{ path: "parentId", message: "must be a top-level category" }]);
    }
    const c = await tx.materialCategory.create({ data: { companyId, code: input.code, name: input.name, parentId: input.parentId ?? null }, select: { id: true, code: true } });
    await audit(tx, ctx, AuditAction.CREATE, "material_categories", c.id, c.code, undefined, input);
    return c;
  });
}

export async function createUnit(input: CreateUnitInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "material:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "unitOfMeasure", companyId, input.code);
    const u = await tx.unitOfMeasure.create({ data: { ...input, companyId } as Prisma.UnitOfMeasureUncheckedCreateInput, select: { id: true, code: true } });
    await audit(tx, ctx, AuditAction.CREATE, "units_of_measure", u.id, u.code, undefined, input);
    return u;
  });
}

/* ---- Vendors ---------------------------------------------------------------------- */

export async function createVendor(input: CreateVendorInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "vendor:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "vendor", companyId, input.code);
    const v = await tx.vendor.create({ data: { ...input, companyId } as Prisma.VendorUncheckedCreateInput, select: { id: true, code: true } });
    await audit(tx, ctx, AuditAction.CREATE, "vendors", v.id, v.code, undefined, input);
    return v;
  });
}

export async function updateVendor(id: string, input: UpdateVendorInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "vendor:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "vendors", id, companyId))) throw AppError.notFound("Vendor", id);
    const v = await tx.vendor.findUniqueOrThrow({ where: { id } });
    if (input.isActive === false && v.isActive) {
      const open = await tx.purchaseOrder.count({ where: { vendorId: id, status: { in: [...OPEN_PO_STATUSES, "DRAFT"] } } });
      refuseInUse(open ? [`${open} open purchase order(s)`] : [], v.code);
    }
    await tx.vendor.update({ where: { id }, data: input });
    const diff = diffValues(v as unknown as Record<string, unknown>, input as Record<string, unknown>);
    // Approving or removing a vendor from the ASL is its own trail event.
    const action = input.isApproved !== undefined && input.isApproved !== v.isApproved ? AuditAction.APPROVE : AuditAction.UPDATE;
    if (diff) await audit(tx, ctx, action, "vendors", id, v.code, diff.previous, diff.next);
  });
}

export async function upsertVendorMaterial(vendorId: string, materialId: string, input: VendorMaterialInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "vendor:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "vendors", vendorId, companyId))) throw AppError.notFound("Vendor", vendorId);
    // Locking the material serialises "preferred" changes for it across vendors.
    if (!(await lockRow(tx, "materials", materialId, companyId))) throw AppError.notFound("Material", materialId);
    const [v, m] = await Promise.all([
      tx.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { code: true } }),
      tx.material.findUniqueOrThrow({ where: { id: materialId }, select: { code: true } }),
    ]);
    if (input.isPreferred && input.isActive) {
      // One preferred supplier per material: MRP and lead-time rules pick it.
      await tx.vendorMaterial.updateMany({ where: { materialId, isPreferred: true, vendorId: { not: vendorId } }, data: { isPreferred: false } });
    }
    const data = {
      leadTimeDays: input.leadTimeDays, unitPrice: input.unitPrice === null ? null : D(input.unitPrice),
      minOrderQty: D(input.minOrderQty), orderMultiple: D(input.orderMultiple),
      isPreferred: input.isPreferred && input.isActive, isActive: input.isActive,
    };
    const before = await tx.vendorMaterial.findUnique({ where: { vendorId_materialId: { vendorId, materialId } } });
    const row = await tx.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId, materialId } },
      create: { vendorId, materialId, ...data },
      update: data,
      select: { id: true },
    });
    const diff = before ? diffValues(before as unknown as Record<string, unknown>, data as Record<string, unknown>) : null;
    await audit(tx, ctx, before ? AuditAction.UPDATE : AuditAction.CREATE, "vendor_materials", row.id, `${v.code}/${m.code}`, diff?.previous, diff?.next ?? input);
  });
}

/* ---- Customers ---------------------------------------------------------------------- */

export async function createCustomer(input: CreateCustomerInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "customer:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "customer", companyId, input.code);
    const c = await tx.customer.create({ data: { ...input, companyId } as Prisma.CustomerUncheckedCreateInput, select: { id: true, code: true } });
    await audit(tx, ctx, AuditAction.CREATE, "customers", c.id, c.code, undefined, input);
    return c;
  });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "customer:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "customers", id, companyId))) throw AppError.notFound("Customer", id);
    const c = await tx.customer.findUniqueOrThrow({ where: { id } });
    if (input.isActive === false && c.isActive) {
      const open = await tx.salesOrder.count({ where: { customerId: id, status: { in: [...OPEN_SO] } } });
      refuseInUse(open ? [`${open} open sales order(s)`] : [], c.code);
    }
    await tx.customer.update({ where: { id }, data: input });
    const diff = diffValues(c as unknown as Record<string, unknown>, input as Record<string, unknown>);
    if (diff) await audit(tx, ctx, AuditAction.UPDATE, "customers", id, c.code, diff.previous, diff.next);
  });
}

/* ---- Locations ------------------------------------------------------------------------ */

export async function createLocation(input: CreateLocationInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "location:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    await assertUniqueCode(tx, "location", companyId, input.code);
    const l = await tx.location.create({ data: { ...input, companyId } as Prisma.LocationUncheckedCreateInput, select: { id: true, code: true } });
    await audit(tx, ctx, AuditAction.CREATE, "locations", l.id, l.code, undefined, input);
    return l;
  });
}

export async function updateLocation(id: string, input: UpdateLocationInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "location:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "locations", id, companyId))) throw AppError.notFound("Location", id);
    const l = await tx.location.findUniqueOrThrow({ where: { id } });
    if (input.isActive === false && l.isActive) {
      const [stock, pos, sos, wos] = await Promise.all([
        tx.inventoryBalance.aggregate({ where: { locationId: id }, _sum: { onHandQty: true } }),
        tx.purchaseOrder.count({ where: { locationId: id, status: { in: [...OPEN_PO_STATUSES, "DRAFT"] } } }),
        tx.salesOrderLine.count({ where: { locationId: id, salesOrder: { status: { in: [...OPEN_SO] } } } }),
        tx.workOrder.count({ where: { locationId: id, status: { in: [...OPEN_WO] } } }),
      ]);
      refuseInUse([
        stock._sum.onHandQty?.gt(0) ? `stock on hand` : "",
        pos ? `${pos} open purchase order(s)` : "",
        sos ? `${sos} open sales order line(s)` : "",
        wos ? `${wos} open work order(s)` : "",
      ].filter(Boolean), l.code);
    }
    if (input.isManufacturing === false && l.isManufacturing) {
      const wos = await tx.workOrder.count({ where: { locationId: id, status: { in: [...OPEN_WO] } } });
      if (wos) throw AppError.conflict(`${l.code} has ${wos} open work order(s); it must stay a manufacturing location until they finish`);
    }
    await tx.location.update({ where: { id }, data: input });
    const diff = diffValues(l as unknown as Record<string, unknown>, input as Record<string, unknown>);
    if (diff) await audit(tx, ctx, AuditAction.UPDATE, "locations", id, l.code, diff.previous, diff.next);
  });
}

/* ---- Company settings ------------------------------------------------------------------- */

export async function updateSettings(input: UpdateSettingsInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "setting:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const [namespace, name] = key.split(".") as [string, string];
      const before = await tx.companySetting.findUnique({ where: { companyId_namespace_key: { companyId, namespace, key: name } } });
      await tx.companySetting.upsert({
        where: { companyId_namespace_key: { companyId, namespace, key: name } },
        create: { companyId, namespace, key: name, value },
        update: { value },
      });
      await audit(tx, ctx, AuditAction.UPDATE, "company_settings", `${namespace}.${name}`, key, { value: before?.value ?? null }, { value });
    }
  });
}
