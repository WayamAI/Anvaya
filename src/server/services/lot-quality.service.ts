import { AuditAction, QcStatus, StockMovementType } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { companyContext, dateOnly } from "@/server/config/business-date";
import { lockRow, runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { bucketForQc } from "@/server/inventory/ledger";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import { assertQcTransition } from "@/server/purchasing/po-rules";
import type { LotQcInput } from "@/server/validation/purchasing";
import { lockBalances, postMovement, shiftStock } from "./stock-ledger.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * A quality decision on a lot: release it, hold it, or reject it.
 *
 *   → APPROVED    held stock becomes unrestricted. A purchased lot needs a
 *                 certificate of analysis on record first — releasing
 *                 material nobody has a CoA for is the audit finding this
 *                 rule exists to prevent.
 *   → QUARANTINE  unrestricted stock becomes held (a PENDING lot is already
 *                 held, so only its status changes).
 *   → REJECTED    what remains of the lot leaves stock: RETURN to the vendor
 *                 for a purchased lot, SCRAP for one made in-house. Final.
 *
 * The receipt lines that brought the lot in carry its inspection status, so
 * they are updated to match.
 */

export interface LotQcResult {
  id: string;
  lotNumber: string;
  qcStatus: QcStatus;
  remainingQty: number;
}

export async function decideLotQuality(lotId: string, input: LotQcInput, ctx: WriteContext): Promise<LotQcResult> {
  requirePermission(ctx.actor, "inventory:update");
  const companyId = ctx.actor.companyId;

  return runInTransaction(async (tx) => {
    // Lock order everywhere is balance before lot (dispatch and issue lock the
    // balance, then draw lots down). A lot's material and location never
    // change, so they can be read unlocked to find which balance to take.
    const where = await tx.inventoryLot.findFirst({
      where: { id: lotId, material: { companyId } },
      select: { materialId: true, locationId: true },
    });
    if (!where) throw AppError.notFound("Lot", lotId);
    await lockBalances(tx, [where]);
    if (!(await lockRow(tx, "inventory_lots", lotId, companyId))) throw AppError.notFound("Lot", lotId);
    const lot = await tx.inventoryLot.findUniqueOrThrow({
      where: { id: lotId },
      include: { material: { select: { code: true } } },
    });
    assertQcTransition(lot.qcStatus, input.status, lot.lotNumber);

    const { today } = await companyContext(companyId, tx);
    const key = { materialId: lot.materialId, locationId: lot.locationId };
    const from = bucketForQc(lot.qcStatus);
    const coaReference = input.coaReference ?? lot.coaReference;

    if (input.status === "APPROVED") {
      if (lot.vendorId && !coaReference) {
        throw AppError.unprocessable(`Lot ${lot.lotNumber} has no certificate of analysis on record`, [
          { path: "coaReference", message: "is required to release a purchased lot" },
        ]);
      }
      if (from === "QUARANTINE") await shiftStock(tx, key, lot.remainingQty, "UNRESTRICTED");
    } else if (input.status === "QUARANTINE") {
      if (from === "UNRESTRICTED") await shiftStock(tx, key, lot.remainingQty, "QUARANTINE");
    } else if (lot.remainingQty.gt(0)) {
      await postMovement(tx, {
        ...key, lotId: lot.id,
        type: lot.vendorId ? StockMovementType.RETURN : StockMovementType.SCRAP,
        quantity: lot.remainingQty.negated(), bucket: from,
        referenceType: MOVEMENT_REF.LOT_QC, referenceId: lot.id,
        occurredAt: new Date(), notes: `Lot ${lot.lotNumber} rejected: ${input.reason}`,
        postedById: ctx.actor.userId, label: lot.material.code,
      });
    }

    const updated = await tx.inventoryLot.update({
      where: { id: lot.id },
      data: {
        qcStatus: input.status,
        coaReference,
        releaseDate: input.status === "APPROVED" ? dateOnly(today) : lot.releaseDate,
        releasedBy: input.status === "APPROVED" ? ctx.actor.name : lot.releasedBy,
      },
      select: { id: true, lotNumber: true, qcStatus: true, remainingQty: true },
    });

    await tx.goodsReceiptLine.updateMany({
      where: { lotId: lot.id },
      data: { inspectionStatus: input.status, inspectionDate: dateOnly(today), inspectorName: ctx.actor.name, coaReference },
    });

    await recordAudit({
      ...auditMeta(ctx), tx,
      action: input.status === "APPROVED" ? AuditAction.RELEASE : AuditAction.UPDATE,
      entityType: "inventory_lots", entityId: lot.id, entityLabel: lot.lotNumber,
      previousValues: { qcStatus: lot.qcStatus, remainingQty: lot.remainingQty.toString() },
      newValues: {
        qcStatus: input.status, remainingQty: updated.remainingQty.toString(),
        reason: input.reason ?? null, coaReference: coaReference ?? null,
      },
    });

    return { id: updated.id, lotNumber: updated.lotNumber, qcStatus: updated.qcStatus, remainingQty: updated.remainingQty.toNumber() };
  });
}
