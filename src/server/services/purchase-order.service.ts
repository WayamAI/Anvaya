import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import {
  deliveredDate, isLineOverdue, isOpenPo, isPoOverdue, outstandingQty, poCounts, receivedPct, totalMatchesLines,
  type PoLineFacts, type PurchaseOrderDetail, type PurchaseOrderList, type PurchaseOrderRow,
} from "@/server/purchasing/purchase-orders";

/**
 * Purchase orders — read side. Every query is scoped by the caller's
 * company; a PO from another company reads as not found.
 */

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const orderInclude = {
  vendor: { select: { id: true, code: true, name: true, isApproved: true } },
  location: { select: { id: true, name: true } },
  lines: { select: { orderedQty: true, receivedQty: true, unitPrice: true, lineTotal: true, expectedDeliveryDate: true } },
  goodsReceipts: { select: { receiptDate: true } },
} satisfies Prisma.PurchaseOrderInclude;

type OrderWithRefs = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

function lineFacts(o: OrderWithRefs): PoLineFacts[] {
  return o.lines.map((l) => ({
    orderedQty: toNumber(l.orderedQty),
    receivedQty: toNumber(l.receivedQty),
    unitPrice: toNumber(l.unitPrice),
    expectedDeliveryDate: isoDate(l.expectedDeliveryDate)!,
  }));
}

function toRow(o: OrderWithRefs, asOf: Date): PurchaseOrderRow {
  const facts = lineFacts(o);
  const total = toNumber(o.totalAmount);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    vendor: o.vendor,
    location: o.location,
    orderDate: isoDate(o.orderDate)!,
    expectedDeliveryDate: isoDate(o.expectedDeliveryDate)!,
    status: o.status,
    totalAmount: total,
    currencyCode: o.currencyCode,
    lineCount: o.lines.length,
    receivedPct: receivedPct(facts),
    overdue: isPoOverdue(o.status, facts, asOf),
    delivered: deliveredDate(isoDate(o.actualDeliveryDate), o.goodsReceipts.map((g) => isoDate(g.receiptDate)!)),
    totalMismatch: !totalMatchesLines(total, o.lines.map((l) => toNumber(l.lineTotal))),
  };
}

/** Every PO, newest order first, with counts per status tab. */
export async function listPurchaseOrders(companyId: string, asOf = new Date()): Promise<PurchaseOrderList> {
  const orders = await prisma.purchaseOrder.findMany({
    where: { companyId },
    include: orderInclude,
    orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
  });
  const rows = orders.map((o) => toRow(o, asOf));
  return { asOf: asOf.toISOString(), orders: rows, counts: poCounts(rows) };
}

/** One PO with its lines, goods receipts and who created and approved it. */
export async function getPurchaseOrder(companyId: string, id: string, asOf = new Date()): Promise<PurchaseOrderDetail> {
  const o = await prisma.purchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      ...orderInclude,
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unitOfMeasure: { select: { code: true } } } } },
        orderBy: { lineNumber: "asc" },
      },
      goodsReceipts: {
        include: {
          location: { select: { name: true } },
          lines: {
            include: {
              purchaseOrderLine: { select: { lineNumber: true } },
              material: { select: { code: true, unitOfMeasure: { select: { code: true } } } },
              lot: { select: { lotNumber: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { receiptDate: "asc" },
      },
    },
  });
  if (!o) throw AppError.notFound("Purchase order", id);

  return {
    ...toRow(o, asOf),
    createdBy: o.createdBy,
    approvedBy: o.approvedBy,
    approvedAt: o.approvedAt ? o.approvedAt.toISOString() : null,
    notes: o.notes,
    lines: o.lines.map((l) => {
      const facts: PoLineFacts = {
        orderedQty: toNumber(l.orderedQty),
        receivedQty: toNumber(l.receivedQty),
        unitPrice: toNumber(l.unitPrice),
        expectedDeliveryDate: isoDate(l.expectedDeliveryDate)!,
      };
      return {
        lineNumber: l.lineNumber,
        material: { id: l.material.id, code: l.material.code, name: l.material.name },
        uom: l.material.unitOfMeasure.code,
        ...facts,
        outstandingQty: outstandingQty(facts.orderedQty, facts.receivedQty),
        lineTotal: toNumber(l.lineTotal),
        // Same rule as the PO: only an open order's lines can be overdue.
        overdue: isOpenPo(o.status) && isLineOverdue(facts, asOf),
      };
    }),
    receipts: o.goodsReceipts.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      receiptDate: isoDate(g.receiptDate)!,
      location: g.location.name,
      lines: g.lines.map((gl) => ({
        lineNumber: gl.purchaseOrderLine.lineNumber,
        materialCode: gl.material.code,
        receivedQty: toNumber(gl.receivedQty),
        uom: gl.material.unitOfMeasure.code,
        lotNumber: gl.lot?.lotNumber ?? null,
        inspectionStatus: gl.inspectionStatus,
      })),
    })),
  };
}
