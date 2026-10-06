import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { sumDecimals, toNumber } from "@/server/api/decimal";
import { planningAsOf } from "@/server/config/as-of";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import { totalMatchesLines } from "@/server/purchasing/purchase-orders";
import { WORK_ORDER_STATUSES, isOpen as isOpenWorkOrder } from "@/server/production/work-orders";
import {
  SO_STATUSES, availableQty, isSoLineOverdue, isSoOverdue, openQty,
  type SalesOrderDetail, type SalesOrderList, type SalesOrderRow, type SoCounts, type SoLineFacts, type SoStatus,
} from "@/server/sales/sales-orders";
import { cursorArgs, pageOf } from "@/server/api/pagination";
import { startOfUtcDay } from "@/server/inventory/lots";

/**
 * Sales orders — read side. Every query is scoped by the caller's company;
 * an order from another company reads as not found. Dates are measured
 * against the planning as-of date, not the wall clock.
 */

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const orderInclude = {
  customer: { select: { id: true, code: true, name: true, type: true } },
  lines: { select: { id: true, quantity: true, shippedQty: true, unitPrice: true, lineTotal: true, requiredDate: true } },
} satisfies Prisma.SalesOrderInclude;

type OrderWithRefs = Prisma.SalesOrderGetPayload<{ include: typeof orderInclude }>;

const lineFacts = (l: OrderWithRefs["lines"][number]): SoLineFacts => ({
  quantity: toNumber(l.quantity),
  shippedQty: toNumber(l.shippedQty),
  requiredDate: isoDate(l.requiredDate)!,
});

function toRow(o: OrderWithRefs, asOf: Date): SalesOrderRow {
  const total = toNumber(o.totalAmount);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customer: o.customer,
    orderDate: isoDate(o.orderDate)!,
    requiredDate: isoDate(o.requiredDate)!,
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    invoiceNumber: o.invoiceNumber,
    dispatchDate: isoDate(o.dispatchDate),
    totalAmount: total,
    currencyCode: o.currencyCode,
    lineCount: o.lines.length,
    overdue: isSoOverdue(o.status, o.lines.map(lineFacts), asOf),
    totalMismatch: !totalMatchesLines(total, o.lines.map((l) => toNumber(l.lineTotal))),
  };
}

/** Ledger issues against the given sales order lines. */
function dispatchesFor<S extends Prisma.StockMovementSelect>(lineIds: string[], select: S) {
  return prisma.stockMovement.findMany({
    where: { type: StockMovementType.ISSUE, referenceType: MOVEMENT_REF.SALES_ORDER_LINE, referenceId: { in: lineIds } },
    select,
  });
}

export interface ListSalesOrdersQuery {
  status?: SoStatus | "overdue";
  q?: string;
  /** Default 50, as the route schema has it. */
  limit?: number;
  cursor?: string;
}

const DAY_MS = 86_400_000;
const AWAITING_DISPATCH: SoStatus[] = ["CONFIRMED", "PROCESSING"];
const money = (n: number) => Math.round(n * 1e4) / 1e4;

/** `isSoOverdue` as SQL: awaiting dispatch, with a line past due and quantity still to ship. */
function overdueWhere(asOf: Date): Prisma.SalesOrderWhereInput {
  return {
    status: { in: AWAITING_DISPATCH },
    lines: { some: { requiredDate: { lt: startOfUtcDay(asOf) }, shippedQty: { lt: prisma.salesOrderLine.fields.quantity } } },
  };
}

/**
 * One page of orders, newest first, filtered to a status tab and a search on
 * number or customer. Tab counts and the headline figures (`soKpis`'
 * definitions, worked in SQL) cover the whole company, whatever the page.
 */
export async function listSalesOrders(companyId: string, query: ListSalesOrdersQuery, asOf = planningAsOf()) {
  const tab: Prisma.SalesOrderWhereInput =
    query.status === "overdue" ? overdueWhere(asOf) : query.status ? { status: query.status } : {};
  const search: Prisma.SalesOrderWhereInput = query.q
    ? { OR: [
        { orderNumber: { contains: query.q, mode: "insensitive" } },
        { customer: { name: { contains: query.q, mode: "insensitive" } } },
        { customer: { code: { contains: query.q, mode: "insensitive" } } },
      ] }
    : {};
  const where: Prisma.SalesOrderWhereInput = { companyId, AND: [tab, search] };

  const today = startOfUtcDay(asOf);
  const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const endOfToday = new Date(today.getTime() + DAY_MS);
  const tally = (w: Prisma.SalesOrderWhereInput) =>
    prisma.salesOrder.aggregate({ where: { companyId, ...w }, _count: { _all: true }, _sum: { totalAmount: true } })
      .then((a) => ({ count: a._count._all, value: money(toNumber(a._sum.totalAmount ?? 0)) }));

  const [orders, total, byStatus, overdue, open, dueNext7Days, bookedToday, dispatched] = await Promise.all([
    prisma.salesOrder.findMany({
      where, include: orderInclude,
      orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }, { id: "desc" }],
      ...cursorArgs({ limit: query.limit ?? 50, cursor: query.cursor }),
    }),
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
    prisma.salesOrder.count({ where: { companyId, ...overdueWhere(asOf) } }),
    tally({ status: { notIn: ["DELIVERED", "CANCELLED"] } }),
    tally({ status: { in: AWAITING_DISPATCH }, requiredDate: { gte: today, lte: new Date(today.getTime() + 7 * DAY_MS) } }),
    tally({ status: { not: "CANCELLED" }, orderDate: today }),
    // Bounded by one month of dispatches, not by the order book.
    prisma.stockMovement.findMany({
      where: {
        type: StockMovementType.ISSUE, referenceType: MOVEMENT_REF.SALES_ORDER_LINE,
        occurredAt: { gte: monthStart, lt: endOfToday }, material: { companyId },
      },
      select: { referenceId: true, quantity: true },
    }),
  ]);

  const lineIds = [...new Set(dispatched.map((m) => m.referenceId!))];
  const prices = lineIds.length
    ? await prisma.salesOrderLine.findMany({ where: { id: { in: lineIds }, salesOrder: { companyId } }, select: { id: true, unitPrice: true } })
    : [];
  const priceOf = new Map(prices.map((l) => [l.id, toNumber(l.unitPrice)]));
  const dispatchedMtd = money(dispatched.reduce((s, m) => s + Math.abs(toNumber(m.quantity)) * (priceOf.get(m.referenceId!) ?? 0), 0));

  const counts = Object.fromEntries(SO_STATUSES.map((s) => [s, 0])) as SoCounts;
  for (const g of byStatus) counts[g.status] = g._count._all;
  counts.all = byStatus.reduce((s, g) => s + g._count._all, 0);
  counts.overdue = overdue;

  const page = pageOf(orders, query.limit ?? 50);
  const list: SalesOrderList = {
    asOf: asOf.toISOString(),
    orders: page.items.map((o) => toRow(o, asOf)),
    counts,
    kpis: { open, dueNext7Days, bookedToday, dispatchedMtd },
  };
  return { list, nextCursor: page.nextCursor, total };
}

const OPEN_WORK_ORDER_STATUSES = WORK_ORDER_STATUSES.filter(isOpenWorkOrder);

/**
 * One order with its lines, the lots each line shipped from, stock of each
 * line's material at its location, and open work orders for that material.
 */
export async function getSalesOrder(companyId: string, id: string, asOf = planningAsOf()): Promise<SalesOrderDetail> {
  const o = await prisma.salesOrder.findFirst({
    where: { id, companyId },
    include: {
      customer: orderInclude.customer,
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, isBatchTracked: true, unitOfMeasure: { select: { code: true } } } },
          location: { select: { id: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!o) throw AppError.notFound("Sales order", id);

  const materialIds = [...new Set(o.lines.map((l) => l.materialId))];
  const [dispatches, balances, workOrders] = await Promise.all([
    dispatchesFor(o.lines.map((l) => l.id), { referenceId: true, quantity: true, lot: { select: { id: true, lotNumber: true } } }),
    prisma.inventoryBalance.findMany({
      where: { materialId: { in: materialIds } },
      select: { materialId: true, locationId: true, onHandQty: true, reservedQty: true, quarantineQty: true },
    }),
    prisma.workOrder.findMany({
      where: { companyId, materialId: { in: materialIds }, status: { in: OPEN_WORK_ORDER_STATUSES } },
      select: { id: true, orderNumber: true, status: true, materialId: true, locationId: true, plannedQty: true, producedQty: true, plannedEndDate: true },
      orderBy: [{ plannedEndDate: "asc" }, { orderNumber: "asc" }],
    }),
  ]);

  return {
    ...toRow(o, asOf),
    asOf: asOf.toISOString(),
    notes: o.notes,
    lines: o.lines.map((l) => {
      const facts = lineFacts(l);
      const bal = balances.find((b) => b.materialId === l.materialId && b.locationId === l.locationId);
      const onHand = bal ? toNumber(bal.onHandQty) : 0;
      const reserved = bal ? toNumber(bal.reservedQty) : 0;
      const quarantine = bal ? toNumber(bal.quarantineQty) : 0;
      return {
        id: l.id,
        lineNumber: l.lineNumber,
        material: { id: l.material.id, code: l.material.code, name: l.material.name, isBatchTracked: l.material.isBatchTracked },
        uom: l.material.unitOfMeasure.code,
        location: l.location,
        ...facts,
        openQty: openQty(facts.quantity, facts.shippedQty),
        unitPrice: toNumber(l.unitPrice),
        lineTotal: toNumber(l.lineTotal),
        // Same rule as the order: a shipped order's lines are not overdue.
        overdue: (o.status === "CONFIRMED" || o.status === "PROCESSING") && isSoLineOverdue(facts, asOf),
        // One entry per lot: a lot shipped across several dispatches is summed.
        lots: [...dispatches
          .filter((d) => d.referenceId === l.id && d.lot)
          .reduce((byLot, d) => {
            const prev = byLot.get(d.lot!.id);
            const qty = sumDecimals([prev?.quantity, d.quantity.abs()]);
            return byLot.set(d.lot!.id, { id: d.lot!.id, lotNumber: d.lot!.lotNumber, quantity: qty });
          }, new Map<string, { id: string; lotNumber: string; quantity: Prisma.Decimal }>())
          .values()].map((x) => ({ ...x, quantity: x.quantity.toNumber() })),
        stock: bal ? { onHand, reserved, quarantine, available: availableQty(onHand, reserved, quarantine) } : null,
        openWorkOrders: workOrders
          .filter((w) => w.materialId === l.materialId && w.locationId === l.locationId)
          .map((w) => ({
            id: w.id,
            orderNumber: w.orderNumber,
            status: w.status,
            plannedQty: toNumber(w.plannedQty),
            producedQty: toNumber(w.producedQty),
            plannedEndDate: isoDate(w.plannedEndDate)!,
          })),
      };
    }),
  };
}
