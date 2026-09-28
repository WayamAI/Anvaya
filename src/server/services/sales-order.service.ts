import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { sumDecimals, toNumber } from "@/server/api/decimal";
import { planningAsOf } from "@/server/config/as-of";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import { totalMatchesLines } from "@/server/purchasing/purchase-orders";
import { WORK_ORDER_STATUSES, isOpen as isOpenWorkOrder } from "@/server/production/work-orders";
import {
  availableQty, isSoLineOverdue, isSoOverdue, openQty, soCounts, soKpis,
  type SalesOrderDetail, type SalesOrderList, type SalesOrderRow, type SoLineFacts,
} from "@/server/sales/sales-orders";

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

/** Every order, newest first, with counts per status and the headline figures. */
export async function listSalesOrders(companyId: string, asOf = planningAsOf()): Promise<SalesOrderList> {
  const orders = await prisma.salesOrder.findMany({
    where: { companyId },
    include: orderInclude,
    orderBy: [{ orderDate: "desc" }, { orderNumber: "desc" }],
  });

  const lines = orders.flatMap((o) => o.lines);
  const priceOf = new Map(lines.map((l) => [l.id, toNumber(l.unitPrice)]));
  const movements = lines.length
    ? await dispatchesFor(lines.map((l) => l.id), { referenceId: true, quantity: true, occurredAt: true })
    : [];

  const rows = orders.map((o) => toRow(o, asOf));
  return {
    asOf: asOf.toISOString(),
    orders: rows,
    counts: soCounts(rows),
    kpis: soKpis({
      orders: rows,
      dispatches: movements.map((m) => ({
        occurredAt: m.occurredAt.toISOString(),
        quantity: Math.abs(toNumber(m.quantity)),
        unitPrice: priceOf.get(m.referenceId!) ?? 0,
      })),
      asOf,
    }),
  };
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
