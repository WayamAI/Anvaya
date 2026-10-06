import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { cursorArgs, pageOf } from "@/server/api/pagination";
import { startOfUtcDay } from "@/server/inventory/lots";
import {
  OPEN_PO_STATUSES, PO_STATUSES, deliveredDate, isLineOverdue, isOpenPo, isPoOverdue, outstandingQty, receivedPct, totalMatchesLines,
  type PoCounts, type PoLineFacts, type PoStatus, type PurchaseOrderDetail, type PurchaseOrderList, type PurchaseOrderRow,
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

export interface ListPurchaseOrdersQuery {
  status?: PoStatus | "overdue";
  q?: string;
  /** Default 50, as the route schema has it. */
  limit?: number;
  cursor?: string;
}

/**
 * "Overdue" (`isPoOverdue`) as SQL: open, with a line past its expected date
 * and quantity still to come — so it can be counted and filtered across the
 * whole company without loading every order.
 */
function overdueWhere(asOf: Date): Prisma.PurchaseOrderWhereInput {
  return {
    status: { in: [...OPEN_PO_STATUSES] },
    lines: { some: { expectedDeliveryDate: { lt: startOfUtcDay(asOf) }, receivedQty: { lt: prisma.purchaseOrderLine.fields.orderedQty } } },
  };
}

/**
 * One page of POs, newest order first, filtered to a status tab and a search
 * on number or vendor. The tab counts cover the whole company, whatever the
 * page, tab or search.
 */
export async function listPurchaseOrders(companyId: string, query: ListPurchaseOrdersQuery, asOf = new Date()) {
  const tab: Prisma.PurchaseOrderWhereInput =
    query.status === "overdue" ? overdueWhere(asOf) : query.status ? { status: query.status } : {};
  const search: Prisma.PurchaseOrderWhereInput = query.q
    ? { OR: [
        { orderNumber: { contains: query.q, mode: "insensitive" } },
        { vendor: { name: { contains: query.q, mode: "insensitive" } } },
        { vendor: { code: { contains: query.q, mode: "insensitive" } } },
      ] }
    : {};
  const where: Prisma.PurchaseOrderWhereInput = { companyId, AND: [tab, search] };

  const [orders, total, byStatus, overdue] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where, include: orderInclude,
      orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }, { id: "desc" }],
      ...cursorArgs({ limit: query.limit ?? 50, cursor: query.cursor }),
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
    prisma.purchaseOrder.count({ where: { companyId, ...overdueWhere(asOf) } }),
  ]);

  const counts = Object.fromEntries(PO_STATUSES.map((s) => [s, 0])) as PoCounts;
  for (const g of byStatus) counts[g.status] = g._count._all;
  counts.all = byStatus.reduce((s, g) => s + g._count._all, 0);
  counts.overdue = overdue;

  const page = pageOf(orders, query.limit ?? 50);
  const list: PurchaseOrderList = { asOf: asOf.toISOString(), orders: page.items.map((o) => toRow(o, asOf)), counts };
  return { list, nextCursor: page.nextCursor, total };
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
        include: { material: { select: { id: true, code: true, name: true, isBatchTracked: true, unitOfMeasure: { select: { code: true } } } } },
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
        id: l.id,
        lineNumber: l.lineNumber,
        material: { id: l.material.id, code: l.material.code, name: l.material.name, isBatchTracked: l.material.isBatchTracked },
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
