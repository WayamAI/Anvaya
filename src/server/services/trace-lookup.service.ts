import { StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { MOVEMENT_REF } from "@/server/inventory/lots";

/**
 * The documents a trace links to — goods receipts and vendors — looked up
 * for the Batch & serial tracking drawers (sales orders live in
 * sales-order.service). Each is scoped to the caller's company in the same
 * query, so a foreign id reads as not found.
 */

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/* ---- Goods receipt --------------------------------------------------------- */

export async function getGoodsReceiptByNumber(companyId: string, grnNumber: string) {
  const grn = await prisma.goodsReceipt.findFirst({
    where: { companyId, grnNumber },
    include: {
      purchaseOrder: { select: { id: true, orderNumber: true, status: true, totalAmount: true } },
      vendor: { select: { id: true, code: true, name: true, isApproved: true } },
      location: { select: { id: true, code: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, kind: true, unitOfMeasure: { select: { code: true } } } },
          lot: { select: { id: true, lotNumber: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!grn) throw AppError.notFound("Goods receipt", grnNumber);

  // Lots produced by work orders that consumed a lot from this receipt.
  const lotIds = grn.lines.map((l) => l.lotId).filter((v): v is string => !!v);
  const orders = lotIds.length
    ? await prisma.workOrderComponent.findMany({
        where: { lotId: { in: lotIds }, workOrder: { companyId } },
        select: { workOrderId: true },
      })
    : [];
  const orderIds = [...new Set(orders.map((o) => o.workOrderId))];
  const produced = orderIds.length
    ? await prisma.stockMovement.findMany({
        where: {
          type: StockMovementType.PRODUCTION_RECEIPT,
          referenceType: MOVEMENT_REF.WORK_ORDER,
          referenceId: { in: orderIds },
          lotId: { not: null },
          material: { companyId },
        },
        select: {
          lot: {
            select: {
              id: true, lotNumber: true, receivedQty: true, qcStatus: true,
              material: { select: { name: true, unitOfMeasure: { select: { code: true } } } },
            },
          },
        },
      })
    : [];
  const producedLots = [...new Map(
    produced.flatMap((m) => (m.lot ? [[m.lot.id, m.lot] as const] : [])),
  ).values()].map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    material: l.material.name,
    quantity: toNumber(l.receivedQty),
    uom: l.material.unitOfMeasure.code,
    qcStatus: l.qcStatus,
  }));

  return {
    id: grn.id,
    grnNumber: grn.grnNumber,
    receiptDate: isoDate(grn.receiptDate)!,
    location: grn.location,
    vendor: grn.vendor,
    purchaseOrder: {
      id: grn.purchaseOrder.id,
      orderNumber: grn.purchaseOrder.orderNumber,
      status: grn.purchaseOrder.status,
      totalAmount: toNumber(grn.purchaseOrder.totalAmount),
    },
    lines: grn.lines.map((l) => ({
      lineNumber: l.lineNumber,
      material: { id: l.material.id, code: l.material.code, name: l.material.name, kind: l.material.kind },
      uom: l.material.unitOfMeasure.code,
      receivedQty: toNumber(l.receivedQty),
      rejectedQty: toNumber(l.rejectedQty),
      lot: l.lot,
      supplierLotNumber: l.supplierLotNumber,
      coaReference: l.coaReference,
      inspectionStatus: l.inspectionStatus,
      inspectionDate: isoDate(l.inspectionDate),
      inspectorName: l.inspectorName,
      storageLocation: l.storageLocation,
      bin: l.bin,
    })),
    producedLots,
  };
}

export type GoodsReceiptDetail = Awaited<ReturnType<typeof getGoodsReceiptByNumber>>;

/* ---- Vendor ------------------------------------------------------------------ */

export async function getVendor(companyId: string, id: string) {
  const v = await prisma.vendor.findFirst({
    where: { id, companyId },
    include: {
      materials: {
        where: { isActive: true },
        include: { material: { select: { code: true, name: true } } },
        orderBy: { material: { code: "asc" } },
      },
      scorecards: { orderBy: { periodEnd: "desc" }, take: 1 },
    },
  });
  if (!v) throw AppError.notFound("Vendor", id);

  const sc = v.scorecards[0];
  return {
    id: v.id,
    code: v.code,
    vendorCode: v.vendorCode,
    name: v.name,
    city: v.city,
    state: v.state,
    contactPerson: v.contactPerson,
    contactEmail: v.contactEmail,
    paymentTerms: v.paymentTerms,
    isApproved: v.isApproved,
    isActive: v.isActive,
    approvedMaterials: v.materials.map((m) => ({ code: m.material.code, name: m.material.name, isPreferred: m.isPreferred })),
    scorecard: sc
      ? {
          periodStart: isoDate(sc.periodStart)!,
          periodEnd: isoDate(sc.periodEnd)!,
          defectRatePercent: toNumber(sc.defectRatePercent),
          onTimeDeliveryPercent: toNumber(sc.onTimeDeliveryPercent),
          copqAmount: toNumber(sc.copqAmount),
          lastAuditDate: isoDate(sc.lastAuditDate),
          auditResult: sc.auditResult,
        }
      : null,
  };
}

export type VendorDetail = Awaited<ReturnType<typeof getVendor>>;
