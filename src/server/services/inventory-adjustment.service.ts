import { AuditAction, Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/audit";
import { toNumber } from "@/server/api/decimal";
import { requirePermission } from "@/server/auth/rbac";
import { lockRow, type Tx } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { averageCost, bucketForQc, unrestricted } from "@/server/inventory/ledger";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import type { AdjustmentInput, ListAdjustmentsQuery } from "@/server/validation/inventory";
import { lockBalances, postMovement, refreshMovingAverage } from "./stock-ledger.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Stock adjustments: a physical count, damage, expiry write-off or found
 * stock brought onto the books.
 *
 * The request says what was counted; the adjustment is counted − book, so a
 * retried or stale form can never apply a delta twice on top of itself —
 * it re-states the truth. Batch-tracked material is counted per lot (the
 * lot's remaining quantity is the book); untracked material per balance
 * (unrestricted on-hand is the book).
 *
 * Every adjustment is an ADJUSTMENT movement through the stock ledger plus
 * an InventoryAdjustment record naming who, why and before/after, and an
 * audit entry — all in one transaction.
 */

export interface AdjustmentResult {
  id: string;
  materialCode: string;
  lotNumber: string | null;
  bookQty: number;
  countedQty: number;
  delta: number;
  unitCost: number;
}

export async function adjustStock(tx: Tx, input: AdjustmentInput, ctx: WriteContext): Promise<AdjustmentResult> {
  requirePermission(ctx.actor, "inventory:adjust");
  const companyId = ctx.actor.companyId;

  const [material, location] = await Promise.all([
    tx.material.findFirst({ where: { id: input.materialId, companyId }, select: { id: true, code: true, isBatchTracked: true, standardCost: true } }),
    tx.location.findFirst({ where: { id: input.locationId, companyId }, select: { id: true, code: true, isActive: true } }),
  ]);
  if (!material) throw AppError.unprocessable("The material does not exist", [{ path: "materialId", message: "not found" }]);
  if (!location) throw AppError.unprocessable("The location does not exist", [{ path: "locationId", message: "not found" }]);
  if (!location.isActive) throw AppError.unprocessable(`${location.code} is inactive`);
  if (material.isBatchTracked && !input.lotId) {
    throw AppError.unprocessable(`${material.code} is batch tracked; count it per lot`, [{ path: "lotId", message: "is required for a batch-tracked material" }]);
  }
  if (!material.isBatchTracked && input.lotId) {
    throw AppError.unprocessable(`${material.code} is not batch tracked`, [{ path: "lotId", message: "must be omitted" }]);
  }

  // Lock order: balance, then lot.
  const key = { materialId: material.id, locationId: location.id };
  const locked = await lockBalances(tx, [key]);
  const balance = locked.get(`${key.materialId}|${key.locationId}`)!;

  let lot: { id: string; lotNumber: string; remainingQty: Prisma.Decimal; qcStatus: string } | null = null;
  if (input.lotId) {
    if (!(await lockRow(tx, "inventory_lots", input.lotId, companyId))) throw AppError.notFound("Lot", input.lotId);
    lot = await tx.inventoryLot.findFirst({
      where: { id: input.lotId, materialId: material.id, locationId: location.id },
      select: { id: true, lotNumber: true, remainingQty: true, qcStatus: true },
    });
    if (!lot) throw AppError.unprocessable(`The lot is not ${material.code} at ${location.code}`, [{ path: "lotId", message: "wrong material or location" }]);
    if (lot.qcStatus === "REJECTED") throw AppError.conflict(`Lot ${lot.lotNumber} is REJECTED; its stock has already left`);
  }

  const book = lot ? lot.remainingQty : unrestricted(balance);
  const counted = new Prisma.Decimal(input.countedQty).toDecimalPlaces(6);
  const delta = counted.minus(book);
  if (delta.isZero()) {
    throw AppError.unprocessable(`The count matches the book (${book}); there is nothing to adjust`, [{ path: "countedQty", message: "equals the book quantity" }]);
  }

  const bucket = lot ? bucketForQc(lot.qcStatus) : "UNRESTRICTED";
  const cost = input.unitCost !== undefined
    ? new Prisma.Decimal(input.unitCost)
    : balance.onHandQty.gt(0) ? averageCost(balance) : (material.standardCost ?? null);
  if (delta.gt(0) && cost === null) {
    throw AppError.unprocessable(`${material.code} has no cost to value found stock at`, [{ path: "unitCost", message: "is required" }]);
  }

  const adjustment = await tx.inventoryAdjustment.create({
    data: {
      materialId: material.id, locationId: location.id,
      quantityBefore: balance.onHandQty, quantityAfter: balance.onHandQty.plus(delta), quantityDelta: delta,
      reason: input.reason, notes: [lot ? `Lot ${lot.lotNumber}` : null, input.notes].filter(Boolean).join(" — ") || null,
      createdById: ctx.actor.userId,
    },
    select: { id: true },
  });

  const posted = await postMovement(tx, {
    ...key, lotId: lot?.id ?? null, type: StockMovementType.ADJUSTMENT, quantity: delta, bucket,
    unitCost: delta.gt(0) ? cost : undefined,
    referenceType: MOVEMENT_REF.INVENTORY_ADJUSTMENT, referenceId: adjustment.id, occurredAt: new Date(),
    notes: `${input.reason}${input.notes ? `: ${input.notes}` : ""}`, postedById: ctx.actor.userId, label: material.code,
  }, locked);

  // The ledger draws a lot down on outflows; found stock in a lot is added here.
  if (lot && delta.gt(0)) {
    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { remainingQty: { increment: delta }, receivedQty: { increment: delta } },
    });
  }
  if (delta.gt(0)) await refreshMovingAverage(tx, material.id);

  await recordAudit({
    ...auditMeta(ctx), tx,
    action: AuditAction.ADJUST, entityType: "inventory_adjustments", entityId: adjustment.id,
    entityLabel: `${material.code}@${location.code}${lot ? `/${lot.lotNumber}` : ""}`,
    previousValues: { book: book.toString() },
    newValues: { counted: counted.toString(), delta: delta.toString(), reason: input.reason, notes: input.notes ?? null, unitCost: posted.unitCost.toString() },
  });

  return {
    id: adjustment.id, materialCode: material.code, lotNumber: lot?.lotNumber ?? null,
    bookQty: book.toNumber(), countedQty: counted.toNumber(), delta: delta.toNumber(), unitCost: posted.unitCost.toNumber(),
  };
}

export async function listAdjustments(companyId: string, query: ListAdjustmentsQuery) {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      material: { companyId },
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    include: {
      material: { select: { id: true, code: true, name: true, unitOfMeasure: { select: { code: true } } } },
      location: { select: { id: true, code: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    material: { id: r.material.id, code: r.material.code, name: r.material.name },
    uom: r.material.unitOfMeasure.code,
    location: r.location,
    quantityBefore: toNumber(r.quantityBefore),
    quantityAfter: toNumber(r.quantityAfter),
    quantityDelta: toNumber(r.quantityDelta),
    reason: r.reason,
    notes: r.notes,
    createdBy: r.createdBy.name,
    createdAt: r.createdAt.toISOString(),
  }));
}
