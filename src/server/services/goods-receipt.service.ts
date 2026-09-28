import { AuditAction, Prisma, PurchaseOrderStatus, QcStatus, StockMovementType } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { addDays, companyContext, dateOnly, isoDate, yearOf } from "@/server/config/business-date";
import { getSetting } from "@/server/config/company-settings";
import { nextDocumentNumber } from "@/server/db/sequence";
import { lockRow, type Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { bucketForQc } from "@/server/inventory/ledger";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import { assertPoTransition, planReceipt, statusAfterReceipt, type ReceiptLineInput } from "@/server/purchasing/po-rules";
import type { CreateGoodsReceiptInput } from "@/server/validation/purchasing";
import { lockBalances, postMovement, refreshMovingAverage } from "./stock-ledger.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Goods receipt against a purchase order.
 *
 * One transaction, in this order:
 *   1. lock the PO, so concurrent receipts against it serialise and the
 *      over-receipt check sees every earlier receipt;
 *   2. check every line (all problems reported together);
 *   3. lock every balance the receipt touches, in a stable order;
 *   4. number the GRN, create a lot per batch-tracked line, write the receipt
 *      lines, post a RECEIPT movement per accepted quantity (held if the lot
 *      awaits inspection) and advance the PO lines;
 *   5. move the PO to PARTIALLY_ or FULLY_RECEIVED;
 *   6. refresh the materials' moving average cost;
 *   7. audit the receipt and the PO status change.
 *
 * Runs inside the caller's transaction (see `runIdempotent`) so the route can
 * store the idempotent response in the same commit.
 */

export interface GoodsReceiptResult {
  id: string;
  grnNumber: string;
  receiptDate: string;
  purchaseOrder: { id: string; orderNumber: string; status: PurchaseOrderStatus };
  lines: {
    lineNumber: number;
    purchaseOrderLineNumber: number;
    materialCode: string;
    receivedQty: number;
    rejectedQty: number;
    inspectionStatus: QcStatus;
    lot: { id: string; lotNumber: string; expiryDate: string | null } | null;
  }[];
}

export async function receiveGoods(tx: Tx, input: CreateGoodsReceiptInput, ctx: WriteContext): Promise<GoodsReceiptResult> {
  requirePermission(ctx.actor, "goods-receipt:create");
  const companyId = ctx.actor.companyId;
  const company = await companyContext(companyId, tx);
  const receiptDate = input.receiptDate ?? company.today;

  if (receiptDate > company.today) {
    throw AppError.unprocessable("A receipt cannot be dated in the future", [{ path: "receiptDate", message: `is after today (${company.today})` }]);
  }

  if (!(await lockRow(tx, "purchase_orders", input.purchaseOrderId, companyId))) {
    throw AppError.notFound("Purchase order", input.purchaseOrderId);
  }
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId },
    include: {
      location: { select: { id: true, code: true, isActive: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: { material: { select: { id: true, code: true, isBatchTracked: true, shelfLifeDays: true } } },
      },
    },
  });

  assertPoTransition(po.status, "receive", po.orderNumber);
  if (!po.location.isActive) throw AppError.unprocessable(`${po.location.code} is inactive; goods cannot be received there`);
  if (receiptDate < isoDate(po.orderDate)) {
    throw AppError.unprocessable("The receipt is dated before the order", [{ path: "receiptDate", message: `is before the order date (${isoDate(po.orderDate)})` }]);
  }

  const tolerance = await getSetting(companyId, "purchasing.overReceiptTolerancePct", tx);
  const planned = planReceipt(
    po.lines.map((l) => ({
      id: l.id, lineNumber: l.lineNumber, orderedQty: l.orderedQty, receivedQty: l.receivedQty,
      materialCode: l.material.code, isBatchTracked: l.material.isBatchTracked,
    })),
    // Schema-validated, so every required field is present; the cast only
    // bridges zod's inferred optionals under this repo's non-strict tsconfig.
    input.lines as ReceiptLineInput[],
    tolerance,
  );

  // Expiry: given, else receipt + shelf life; never on or before receipt.
  const poLineById = new Map(po.lines.map((l) => [l.id, l]));
  const expiries = input.lines.map((l) => {
    const m = poLineById.get(l.purchaseOrderLineId)!.material;
    return l.expiryDate ?? (m.shelfLifeDays ? addDays(receiptDate, m.shelfLifeDays) : null);
  });
  const dateProblems: ErrorDetail[] = [];
  expiries.forEach((e, i) => {
    if (e && e <= receiptDate) dateProblems.push({ path: `lines.${i}.expiryDate`, message: "must be after the receipt date" });
  });
  if (dateProblems.length) throw AppError.unprocessable("The receipt cannot be posted", dateProblems);

  const locked = await lockBalances(tx, planned.filter((p) => p.accepted.gt(0)).map((p) => ({
    materialId: poLineById.get(p.poLine.id)!.materialId, locationId: po.locationId,
  })));

  const grnNumber = await nextDocumentNumber(tx, companyId, "GOODS_RECEIPT", yearOf(receiptDate));
  const receipt = await tx.goodsReceipt.create({
    data: {
      companyId, grnNumber, purchaseOrderId: po.id, vendorId: po.vendorId, locationId: po.locationId,
      receiptDate: dateOnly(receiptDate), notes: input.notes ?? null, receivedById: ctx.actor.userId,
    },
    select: { id: true },
  });

  // Today's receipts carry the real time; a back-dated one sits at the start
  // of its day, so the ledger stays in date order.
  const occurredAt = receiptDate === company.today ? new Date() : dateOnly(receiptDate);
  const result: GoodsReceiptResult["lines"] = [];
  const touchedMaterials = new Set<string>();

  for (const [i, p] of planned.entries()) {
    const src = input.lines[i];
    const poLine = poLineById.get(p.poLine.id)!;
    const material = poLine.material;

    let lot: GoodsReceiptResult["lines"][number]["lot"] = null;
    if (material.isBatchTracked && p.accepted.gt(0)) {
      const lotNumber = await nextDocumentNumber(tx, companyId, "PURCHASED_LOT", yearOf(receiptDate));
      const created = await tx.inventoryLot.create({
        data: {
          materialId: material.id, locationId: po.locationId, lotNumber,
          supplierLotNumber: src.supplierLotNumber ?? null, vendorId: po.vendorId,
          receivedQty: p.accepted, consumedQty: 0, remainingQty: p.accepted,
          receiptDate: dateOnly(receiptDate), expiryDate: expiries[i] ? dateOnly(expiries[i]!) : null,
          qcStatus: p.inspectionStatus, coaReference: src.coaReference ?? null,
          releaseDate: p.inspectionStatus === "APPROVED" ? dateOnly(receiptDate) : null,
          releasedBy: p.inspectionStatus === "APPROVED" ? (src.inspectorName ?? ctx.actor.name) : null,
          storageLocation: src.storageLocation ?? null, bin: src.bin ?? null,
        },
        select: { id: true, lotNumber: true },
      });
      lot = { id: created.id, lotNumber: created.lotNumber, expiryDate: expiries[i] };
    }

    const grnLine = await tx.goodsReceiptLine.create({
      data: {
        goodsReceiptId: receipt.id, lineNumber: i + 1, purchaseOrderLineId: poLine.id, materialId: material.id,
        lotId: lot?.id ?? null, receivedQty: p.accepted, rejectedQty: p.rejected,
        supplierLotNumber: src.supplierLotNumber ?? null, coaReference: src.coaReference ?? null,
        inspectionStatus: p.inspectionStatus,
        inspectionDate: p.inspectionStatus === "PENDING" ? null : dateOnly(receiptDate),
        inspectorName: src.inspectorName ?? null,
        storageLocation: src.storageLocation ?? null, bin: src.bin ?? null,
      },
      select: { id: true },
    });

    if (p.accepted.gt(0)) {
      await postMovement(tx, {
        materialId: material.id, locationId: po.locationId, lotId: lot?.id ?? null,
        type: StockMovementType.RECEIPT, quantity: p.accepted, bucket: bucketForQc(p.inspectionStatus),
        unitCost: poLine.unitPrice, referenceType: MOVEMENT_REF.GOODS_RECEIPT_LINE, referenceId: grnLine.id,
        occurredAt, notes: `${grnNumber} against ${po.orderNumber}`, postedById: ctx.actor.userId, label: material.code,
      }, locked);
      await tx.purchaseOrderLine.update({ where: { id: poLine.id }, data: { receivedQty: p.receivedAfter } });
      touchedMaterials.add(material.id);
    }

    result.push({
      lineNumber: i + 1, purchaseOrderLineNumber: poLine.lineNumber, materialCode: material.code,
      receivedQty: p.accepted.toNumber(), rejectedQty: p.rejected.toNumber(),
      inspectionStatus: p.inspectionStatus, lot,
    });
  }

  for (const materialId of touchedMaterials) await refreshMovingAverage(tx, materialId);

  // A receipt that only records rejections leaves the PO where it was.
  const receivedAfter = new Map(planned.map((p) => [p.poLine.id, p.receivedAfter]));
  const lineState = po.lines.map((l) => ({ orderedQty: l.orderedQty, receivedQty: receivedAfter.get(l.id) ?? l.receivedQty }));
  const anyReceived = lineState.some((l) => new Prisma.Decimal(l.receivedQty).gt(0));
  const status = anyReceived ? statusAfterReceipt(lineState) : po.status;
  if (status !== po.status) {
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status,
        actualDeliveryDate: status === PurchaseOrderStatus.FULLY_RECEIVED ? dateOnly(receiptDate) : undefined,
      },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "purchase_orders", entityId: po.id, entityLabel: po.orderNumber,
      previousValues: { status: po.status }, newValues: { status, via: grnNumber },
    });
  }

  await recordAudit({
    ...auditMeta(ctx), tx,
    action: AuditAction.RECEIVE, entityType: "goods_receipts", entityId: receipt.id, entityLabel: grnNumber,
    newValues: {
      purchaseOrder: po.orderNumber, receiptDate,
      lines: result.map((l) => ({
        material: l.materialCode, receivedQty: l.receivedQty, rejectedQty: l.rejectedQty,
        inspectionStatus: l.inspectionStatus, lot: l.lot?.lotNumber ?? null,
      })),
    },
  });

  return {
    id: receipt.id, grnNumber, receiptDate,
    purchaseOrder: { id: po.id, orderNumber: po.orderNumber, status },
    lines: result,
  };
}
