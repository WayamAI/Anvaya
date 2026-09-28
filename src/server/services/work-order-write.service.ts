import { AuditAction, Prisma, StockMovementType, WorkOrderStatus } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { addDays, companyContext, dateOnly, isoDate, yearOf } from "@/server/config/business-date";
import { getSetting } from "@/server/config/company-settings";
import { nextDocumentNumber } from "@/server/db/sequence";
import { lockRow, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { bucketForQc } from "@/server/inventory/ledger";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import {
  assertOutputWithinPlan, assertWoTransition, outputUnitCost, planIssue, snapshotComponents,
  type IssueLineInput,
} from "@/server/production/wo-rules";
import type {
  CancelWorkOrderInput, CreateWorkOrderInput, IssueInput, OutputInput, UpdateWorkOrderInput,
} from "@/server/validation/production";
import { resolveLotDraws } from "./lot-allocation.service";
import { lockBalances, postMovement, refreshMovingAverage } from "./stock-ledger.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Work orders — write side: plan, firm, release, issue components, report
 * output, complete, close, cancel.
 *
 * Component issues are PRODUCTION_ISSUE movements and output is a
 * PRODUCTION_RECEIPT movement, both referencing the work order — the ledger
 * links the traceability screens already read. An issue may draw a component
 * from several lots; each lot is its own movement, and the component row
 * keeps the first lot as its headline link.
 *
 * Output is valued at the actual cost of what was issued to the order (see
 * `outputUnitCost`), so finished stock carries what it consumed.
 */

const WO = MOVEMENT_REF.WORK_ORDER;

async function resolveBomVersion(tx: Tx, companyId: string, materialId: string, bomVersionId?: string) {
  const version = await tx.bomVersion.findFirst({
    where: {
      bom: { companyId, materialId },
      ...(bomVersionId ? { id: bomVersionId } : { isActive: true }),
    },
    include: {
      components: {
        include: { material: { select: { id: true, code: true, unitOfMeasureId: true, isActive: true } } },
      },
    },
  });
  if (!version) {
    throw AppError.unprocessable(
      bomVersionId ? "The BOM version does not belong to this product" : "The product has no active BOM version",
      [{ path: "bomVersionId", message: bomVersionId ? "not a version of this product's BOM" : "no active BOM" }],
    );
  }
  const inactive = version.components.filter((c) => !c.isOptional && !c.material.isActive);
  if (inactive.length) {
    throw AppError.unprocessable("The BOM uses inactive materials", inactive.map((c) => ({ path: "bom", message: `${c.material.code} is inactive` })));
  }
  return version;
}

function snapshot(version: Awaited<ReturnType<typeof resolveBomVersion>>, qty: Prisma.Decimal, requiredDate: string) {
  return snapshotComponents(
    version.components.map((c) => ({
      materialId: c.materialId, materialCode: c.material.code,
      unitOfMeasureId: c.unitOfMeasureId, stockUnitOfMeasureId: c.material.unitOfMeasureId,
      quantity: c.quantity, scrapFactor: c.scrapFactor, leadTimeOffsetDays: c.leadTimeOffsetDays, isOptional: c.isOptional,
    })),
    version.baseQuantity,
    qty,
  ).map((s) => ({ materialId: s.materialId, requiredQty: s.requiredQty, requiredDate: dateOnly(requiredDate) }));
}

function assertDates(start: string, end: string) {
  if (end < start) throw AppError.unprocessable("The dates are inconsistent", [{ path: "plannedEndDate", message: "cannot be before the planned start" }]);
}

async function lockWo(tx: Tx, companyId: string, id: string) {
  if (!(await lockRow(tx, "work_orders", id, companyId))) throw AppError.notFound("Work order", id);
  return tx.workOrder.findUniqueOrThrow({
    where: { id },
    include: {
      material: { select: { id: true, code: true, isBatchTracked: true, shelfLifeDays: true, standardCost: true } },
      location: { select: { id: true, code: true, isActive: true } },
      components: { include: { material: { select: { code: true, isBatchTracked: true } } } },
    },
  });
}

/* ---- Plan -------------------------------------------------------------------- */

export async function createWorkOrder(input: CreateWorkOrderInput, ctx: WriteContext): Promise<{ id: string; orderNumber: string }> {
  requirePermission(ctx.actor, "work-order:create");
  return runInTransaction((tx) => createWorkOrderTx(tx, input, ctx));
}

/** The same, inside the caller's transaction (MRP converts several at once). */
export async function createWorkOrderTx(tx: Tx, input: CreateWorkOrderInput, ctx: WriteContext): Promise<{ id: string; orderNumber: string }> {
  requirePermission(ctx.actor, "work-order:create");
  const companyId = ctx.actor.companyId;
  {
    assertDates(input.plannedStartDate, input.plannedEndDate);
    const [material, location] = await Promise.all([
      tx.material.findFirst({ where: { id: input.materialId, companyId }, select: { id: true, code: true, isActive: true } }),
      tx.location.findFirst({ where: { id: input.locationId, companyId }, select: { id: true, code: true, isActive: true, isManufacturing: true } }),
    ]);
    const problems: ErrorDetail[] = [];
    if (!material) problems.push({ path: "materialId", message: "not found" });
    else if (!material.isActive) problems.push({ path: "materialId", message: `${material.code} is inactive` });
    if (!location) problems.push({ path: "locationId", message: "not found" });
    else if (!location.isActive) problems.push({ path: "locationId", message: `${location.code} is inactive` });
    else if (!location.isManufacturing) problems.push({ path: "locationId", message: `${location.code} is not a manufacturing location` });
    if (problems.length) throw AppError.unprocessable("The work order cannot be planned", problems);

    const version = await resolveBomVersion(tx, companyId, input.materialId, input.bomVersionId);
    const plannedQty = new Prisma.Decimal(input.plannedQty);
    const components = snapshot(version, plannedQty, input.plannedStartDate);

    const { today } = await companyContext(companyId, tx);
    const orderNumber = await nextDocumentNumber(tx, companyId, "WORK_ORDER", yearOf(today));
    const wo = await tx.workOrder.create({
      data: {
        companyId, orderNumber, materialId: input.materialId, locationId: input.locationId, bomVersionId: version.id,
        plannedQty, plannedStartDate: dateOnly(input.plannedStartDate), plannedEndDate: dateOnly(input.plannedEndDate),
        status: WorkOrderStatus.PLANNED, priority: input.priority ?? 0, notes: input.notes ?? null,
        components: { create: components },
        operations: {
          create: (input.operations ?? []).map((op, i) => ({
            sequence: (i + 1) * 10, name: op.name, workCentre: op.workCentre ?? null,
            setupMinutes: new Prisma.Decimal(op.setupMinutes ?? 0), runMinutes: new Prisma.Decimal(op.runMinutes ?? 0),
          })),
        },
      },
      select: { id: true },
    });

    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CREATE, entityType: "work_orders", entityId: wo.id, entityLabel: orderNumber,
      newValues: {
        status: "PLANNED", materialId: input.materialId, locationId: input.locationId, bomVersionId: version.id,
        plannedQty: plannedQty.toString(), plannedStartDate: input.plannedStartDate, plannedEndDate: input.plannedEndDate,
        components: components.map((c) => ({ materialId: c.materialId, requiredQty: c.requiredQty.toString() })),
      },
    });
    return { id: wo.id, orderNumber };
  }
}

export async function updateWorkOrder(id: string, input: UpdateWorkOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "work-order:update");
  const companyId = ctx.actor.companyId;

  await runInTransaction(async (tx) => {
    const wo = await lockWo(tx, companyId, id);
    assertWoTransition(wo.status, "edit", wo.orderNumber);
    const start = input.plannedStartDate ?? isoDate(wo.plannedStartDate);
    const end = input.plannedEndDate ?? isoDate(wo.plannedEndDate);
    assertDates(start, end);

    const qtyChanged = input.plannedQty !== undefined && !wo.plannedQty.equals(input.plannedQty);
    if (qtyChanged || input.plannedStartDate) {
      if (!wo.bomVersionId) throw AppError.unprocessable(`${wo.orderNumber} has no BOM version to re-plan components from`);
      const version = await resolveBomVersion(tx, companyId, wo.materialId, wo.bomVersionId);
      const components = snapshot(version, new Prisma.Decimal(input.plannedQty ?? wo.plannedQty), start);
      await tx.workOrderComponent.deleteMany({ where: { workOrderId: id } });
      await tx.workOrderComponent.createMany({ data: components.map((c) => ({ ...c, workOrderId: id })) });
    }

    const data = {
      plannedQty: input.plannedQty !== undefined ? new Prisma.Decimal(input.plannedQty) : undefined,
      plannedStartDate: input.plannedStartDate ? dateOnly(input.plannedStartDate) : undefined,
      plannedEndDate: input.plannedEndDate ? dateOnly(input.plannedEndDate) : undefined,
      priority: input.priority,
      notes: input.notes === undefined ? undefined : input.notes || null,
    };
    await tx.workOrder.update({ where: { id }, data });

    const fmt = (x: unknown) => (x instanceof Date ? isoDate(x) : x == null ? null : String(x));
    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const before = (wo as Record<string, unknown>)[k];
      if (fmt(before) !== fmt(v)) { previous[k] = fmt(before); next[k] = fmt(v); }
    }
    if (Object.keys(next).length) {
      await recordAudit({
        ...auditMeta(ctx), tx,
        action: AuditAction.UPDATE, entityType: "work_orders", entityId: id, entityLabel: wo.orderNumber,
        previousValues: previous, newValues: next,
      });
    }
  });
}

/* ---- Simple transitions ------------------------------------------------------- */

async function transition(
  id: string,
  ctx: WriteContext,
  action: "firm" | "release" | "complete" | "close",
  to: WorkOrderStatus,
  audit: AuditAction,
) {
  requirePermission(ctx.actor, "work-order:update");
  await runInTransaction(async (tx) => {
    const wo = await lockWo(tx, ctx.actor.companyId, id);
    assertWoTransition(wo.status, action, wo.orderNumber);
    const { today } = await companyContext(ctx.actor.companyId, tx);
    if (action === "release" && !wo.location.isActive) throw AppError.unprocessable(`${wo.location.code} is inactive`);
    await tx.workOrder.update({
      where: { id },
      data: { status: to, ...(action === "complete" ? { actualEndDate: dateOnly(today) } : {}) },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: audit, entityType: "work_orders", entityId: id, entityLabel: wo.orderNumber,
      previousValues: { status: wo.status }, newValues: { status: to },
    });
  });
}

export const firmWorkOrder = (id: string, ctx: WriteContext) => transition(id, ctx, "firm", WorkOrderStatus.FIRMED, AuditAction.UPDATE);
export const releaseWorkOrder = (id: string, ctx: WriteContext) => transition(id, ctx, "release", WorkOrderStatus.RELEASED, AuditAction.RELEASE);
export const completeWorkOrder = (id: string, ctx: WriteContext) => transition(id, ctx, "complete", WorkOrderStatus.COMPLETED, AuditAction.COMPLETE);
export const closeWorkOrder = (id: string, ctx: WriteContext) => transition(id, ctx, "close", WorkOrderStatus.CLOSED, AuditAction.UPDATE);

export async function cancelWorkOrder(id: string, input: CancelWorkOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "work-order:update");
  await runInTransaction(async (tx) => {
    const wo = await lockWo(tx, ctx.actor.companyId, id);
    assertWoTransition(wo.status, "cancel", wo.orderNumber);
    if (wo.producedQty.gt(0) || wo.components.some((c) => c.issuedQty.gt(0))) {
      throw AppError.conflict(`${wo.orderNumber} has issued material or output; complete and close it instead of cancelling`);
    }
    const note = `Cancelled ${new Date().toISOString().slice(0, 10)} by ${ctx.actor.name}: ${input.reason}`;
    await tx.workOrder.update({ where: { id }, data: { status: WorkOrderStatus.CANCELLED, notes: wo.notes ? `${wo.notes}\n${note}` : note } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CANCEL, entityType: "work_orders", entityId: id, entityLabel: wo.orderNumber,
      previousValues: { status: wo.status }, newValues: { status: "CANCELLED", reason: input.reason },
    });
  });
}

/* ---- Issue components -------------------------------------------------------- */

export interface IssueResult {
  workOrder: { id: string; orderNumber: string; status: WorkOrderStatus };
  lines: { materialCode: string; quantity: number; issuedQty: number; lots: { lotId: string; lotNumber: string; quantity: number }[] }[];
}

export async function issueComponents(tx: Tx, id: string, input: IssueInput, ctx: WriteContext): Promise<IssueResult> {
  requirePermission(ctx.actor, "work-order:update");
  const companyId = ctx.actor.companyId;
  const { today } = await companyContext(companyId, tx);
  const issueDate = input.issueDate ?? today;
  if (issueDate > today) throw AppError.unprocessable("An issue cannot be dated in the future", [{ path: "issueDate", message: `is after today (${today})` }]);

  const wo = await lockWo(tx, companyId, id);
  assertWoTransition(wo.status, "issue", wo.orderNumber);
  if (!wo.location.isActive) throw AppError.unprocessable(`${wo.location.code} is inactive; nothing can be issued there`);

  const tolerance = await getSetting(companyId, "production.overIssueTolerancePct", tx);
  const planned = planIssue(
    wo.components.map((c) => ({ id: c.id, materialId: c.materialId, materialCode: c.material.code, requiredQty: c.requiredQty, issuedQty: c.issuedQty })),
    input.lines as IssueLineInput[],
    tolerance,
  );
  const componentById = new Map(wo.components.map((c) => [c.id, c]));
  const locked = await lockBalances(tx, planned.map((p) => ({ materialId: p.component.materialId, locationId: wo.locationId })));

  const occurredAt = issueDate === today ? new Date() : dateOnly(issueDate);
  const problems: ErrorDetail[] = [];
  const lines: IssueResult["lines"] = [];

  for (const [i, p] of planned.entries()) {
    const c = componentById.get(p.component.id)!;
    const draws = await resolveLotDraws(tx, {
      materialId: c.materialId, locationId: wo.locationId, materialCode: c.material.code, locationCode: wo.location.code,
      isBatchTracked: c.material.isBatchTracked, quantity: p.quantity, onDate: issueDate, lots: p.input.lots, path: `lines.${i}`,
    }, problems);
    if (!draws) continue;

    for (const d of draws) {
      await postMovement(tx, {
        materialId: c.materialId, locationId: wo.locationId, lotId: d.lotId,
        type: StockMovementType.PRODUCTION_ISSUE, quantity: d.quantity.negated(), bucket: "UNRESTRICTED",
        referenceType: WO, referenceId: wo.id, occurredAt,
        notes: `Issue to ${wo.orderNumber}`, postedById: ctx.actor.userId, label: c.material.code,
      }, locked);
    }
    await tx.workOrderComponent.update({
      where: { id: c.id },
      data: { issuedQty: p.issuedAfter, lotId: c.lotId ?? draws.find((d) => d.lotId)?.lotId ?? null },
    });
    lines.push({
      materialCode: c.material.code, quantity: p.quantity.toNumber(), issuedQty: p.issuedAfter.toNumber(),
      lots: draws.filter((d) => d.lotId).map((d) => ({ lotId: d.lotId!, lotNumber: d.lotNumber!, quantity: d.quantity.toNumber() })),
    });
  }
  if (problems.length) throw AppError.unprocessable("The issue cannot be posted", problems);

  const status = wo.status === WorkOrderStatus.RELEASED ? WorkOrderStatus.IN_PROGRESS : wo.status;
  await tx.workOrder.update({
    where: { id },
    data: { status, actualStartDate: wo.actualStartDate ?? dateOnly(issueDate) },
  });
  await recordAudit({
    ...auditMeta(ctx), tx,
    action: AuditAction.ISSUE, entityType: "work_orders", entityId: wo.id, entityLabel: wo.orderNumber,
    previousValues: { status: wo.status },
    newValues: { status, issueDate, lines: lines.map((l) => ({ material: l.materialCode, quantity: l.quantity, lots: l.lots.map((x) => `${x.lotNumber}:${x.quantity}`) })) },
  });

  return { workOrder: { id: wo.id, orderNumber: wo.orderNumber, status }, lines };
}

/* ---- Report output ------------------------------------------------------------- */

export interface OutputResult {
  workOrder: { id: string; orderNumber: string; status: WorkOrderStatus; producedQty: number; scrappedQty: number };
  lot: { id: string; lotNumber: string; qcStatus: string; expiryDate: string | null } | null;
  quantity: number;
  unitCost: number;
}

export async function reportOutput(tx: Tx, id: string, input: OutputInput, ctx: WriteContext): Promise<OutputResult> {
  requirePermission(ctx.actor, "work-order:update");
  const companyId = ctx.actor.companyId;
  const { today } = await companyContext(companyId, tx);
  const producedDate = input.producedDate ?? today;
  if (producedDate > today) throw AppError.unprocessable("Output cannot be dated in the future", [{ path: "producedDate", message: `is after today (${today})` }]);

  const wo = await lockWo(tx, companyId, id);
  assertWoTransition(wo.status, "output", wo.orderNumber);

  const qty = new Prisma.Decimal(input.quantity);
  const scrapped = new Prisma.Decimal(input.scrappedQty ?? 0);
  const producedAfter = wo.producedQty.plus(qty);
  assertOutputWithinPlan(wo.plannedQty, producedAfter, await getSetting(companyId, "production.overProductionTolerancePct", tx), wo.orderNumber);

  const qcStatus = input.qcStatus ?? (wo.material.isBatchTracked ? "PENDING" : "APPROVED");
  if (!wo.material.isBatchTracked && qcStatus !== "APPROVED" && qty.gt(0)) {
    throw AppError.unprocessable(`${wo.material.code} is not batch tracked, so its output cannot be held for inspection`, [{ path: "qcStatus", message: "must be APPROVED" }]);
  }
  const expiry = input.expiryDate ?? (wo.material.shelfLifeDays ? addDays(producedDate, wo.material.shelfLifeDays) : null);
  if (expiry && expiry <= producedDate) throw AppError.unprocessable("Expiry must be after the production date", [{ path: "expiryDate", message: "is not after the produced date" }]);

  let lot: OutputResult["lot"] = null;
  let unitCost = new Prisma.Decimal(0);

  if (qty.gt(0)) {
    const locked = await lockBalances(tx, [{ materialId: wo.materialId, locationId: wo.locationId }]);

    const movements = await tx.stockMovement.findMany({
      where: { referenceType: WO, referenceId: wo.id, type: { in: [StockMovementType.PRODUCTION_ISSUE, StockMovementType.PRODUCTION_RECEIPT] } },
      select: { type: true, quantity: true, unitCost: true },
    });
    const value = (type: StockMovementType) => movements
      .filter((m) => m.type === type)
      .reduce((s, m) => s.plus(m.quantity.abs().times(m.unitCost ?? 0)), new Prisma.Decimal(0));
    unitCost = outputUnitCost({
      issuedValue: value(StockMovementType.PRODUCTION_ISSUE),
      capitalisedValue: value(StockMovementType.PRODUCTION_RECEIPT),
      quantity: qty,
      remainingToMake: Prisma.Decimal.max(0, wo.plannedQty.minus(wo.producedQty)),
      completing: !!input.complete,
      standardCost: wo.material.standardCost,
    });

    if (wo.material.isBatchTracked) {
      const lotNumber = await nextDocumentNumber(tx, companyId, "PRODUCED_LOT", yearOf(producedDate));
      const created = await tx.inventoryLot.create({
        data: {
          materialId: wo.materialId, locationId: wo.locationId, lotNumber,
          receivedQty: qty, consumedQty: 0, remainingQty: qty,
          receiptDate: dateOnly(producedDate), expiryDate: expiry ? dateOnly(expiry) : null, qcStatus,
          releaseDate: qcStatus === "APPROVED" ? dateOnly(producedDate) : null,
          releasedBy: qcStatus === "APPROVED" ? ctx.actor.name : null,
          storageLocation: input.storageLocation ?? null, bin: input.bin ?? null,
        },
        select: { id: true, lotNumber: true },
      });
      lot = { id: created.id, lotNumber: created.lotNumber, qcStatus, expiryDate: expiry };
    }

    await postMovement(tx, {
      materialId: wo.materialId, locationId: wo.locationId, lotId: lot?.id ?? null,
      type: StockMovementType.PRODUCTION_RECEIPT, quantity: qty, bucket: bucketForQc(qcStatus), unitCost,
      referenceType: WO, referenceId: wo.id,
      occurredAt: producedDate === today ? new Date() : dateOnly(producedDate),
      notes: `Output of ${wo.orderNumber}`, postedById: ctx.actor.userId, label: wo.material.code,
    }, locked);
    await refreshMovingAverage(tx, wo.materialId);
  }

  const status = input.complete ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS;
  const updated = await tx.workOrder.update({
    where: { id },
    data: {
      producedQty: producedAfter,
      scrappedQty: wo.scrappedQty.plus(scrapped),
      status,
      actualStartDate: wo.actualStartDate ?? dateOnly(producedDate),
      ...(input.complete ? { actualEndDate: dateOnly(producedDate) } : {}),
    },
    select: { producedQty: true, scrappedQty: true },
  });

  await recordAudit({
    ...auditMeta(ctx), tx,
    action: input.complete ? AuditAction.COMPLETE : AuditAction.UPDATE,
    entityType: "work_orders", entityId: wo.id, entityLabel: wo.orderNumber,
    previousValues: { status: wo.status, producedQty: wo.producedQty.toString(), scrappedQty: wo.scrappedQty.toString() },
    newValues: {
      status, producedQty: updated.producedQty.toString(), scrappedQty: updated.scrappedQty.toString(),
      output: qty.toString(), unitCost: unitCost.toString(), lot: lot?.lotNumber ?? null, producedDate,
    },
  });

  return {
    workOrder: { id: wo.id, orderNumber: wo.orderNumber, status, producedQty: updated.producedQty.toNumber(), scrappedQty: updated.scrappedQty.toNumber() },
    lot, quantity: qty.toNumber(), unitCost: unitCost.toNumber(),
  };
}
