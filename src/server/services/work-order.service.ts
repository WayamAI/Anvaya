import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import {
  WORK_ORDER_STATUSES, componentReadiness, isOpen, isOverdue, traceCompleteness, workCentreRoute,
  type StatusCounts, type WorkOrderDetail, type WorkOrderList, type WorkOrderRow, type WorkOrderStatus,
} from "@/server/production/work-orders";
import { cursorArgs, pageOf } from "@/server/api/pagination";
import { startOfUtcDay } from "@/server/inventory/lots";

/**
 * Work orders — read side. Every query is scoped by the caller's company;
 * an order from another company reads as not found.
 */

const orderInclude = {
  material: { select: { id: true, code: true, name: true, unitOfMeasure: { select: { code: true } } } },
  location: { select: { id: true, name: true } },
  bomVersion: { select: { version: true, bom: { select: { code: true } } } },
  operations: { select: { sequence: true, workCentre: true }, orderBy: { sequence: "asc" } },
  components: { select: { lotId: true } },
} satisfies Prisma.WorkOrderInclude;

type OrderWithRefs = Prisma.WorkOrderGetPayload<{ include: typeof orderInclude }>;

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function toRow(o: OrderWithRefs, asOf: Date): WorkOrderRow {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    product: { id: o.material.id, code: o.material.code, name: o.material.name },
    uom: o.material.unitOfMeasure.code,
    location: o.location,
    plannedQty: toNumber(o.plannedQty),
    producedQty: toNumber(o.producedQty),
    scrappedQty: toNumber(o.scrappedQty),
    bom: o.bomVersion ? { code: o.bomVersion.bom.code, version: o.bomVersion.version } : null,
    plannedStartDate: isoDate(o.plannedStartDate)!,
    plannedEndDate: isoDate(o.plannedEndDate)!,
    actualStartDate: isoDate(o.actualStartDate),
    actualEndDate: isoDate(o.actualEndDate),
    status: o.status,
    overdue: isOverdue(o.status, o.plannedEndDate, asOf),
    priority: o.priority,
    workCentres: workCentreRoute(o.operations),
    componentCount: o.components.length,
    componentsWithLot: o.components.filter((c) => c.lotId !== null).length,
    traceComplete: traceCompleteness(o.status, o.components),
  };
}

/**
 * Every work order as list rows, unpaged — for the production schedule, which
 * plots them all. Screens that list orders use `listWorkOrders`.
 */
export async function allWorkOrderRows(companyId: string, asOf = new Date()): Promise<WorkOrderRow[]> {
  const orders = await prisma.workOrder.findMany({
    where: { companyId },
    include: orderInclude,
    orderBy: [{ plannedStartDate: "desc" }, { orderNumber: "desc" }],
  });
  return orders.map((o) => toRow(o, asOf));
}

export interface ListWorkOrdersQuery {
  status?: WorkOrderStatus | "overdue";
  q?: string;
  /** Default 50, as the route schema has it. */
  limit?: number;
  cursor?: string;
}

/** `isOverdue` as SQL: still open, planned to have finished before today. */
function overdueWhere(asOf: Date): Prisma.WorkOrderWhereInput {
  return { status: { in: WORK_ORDER_STATUSES.filter(isOpen) }, plannedEndDate: { lt: startOfUtcDay(asOf) } };
}

/**
 * One page of work orders, newest planned start first, filtered to a status
 * tab and a search on number or product. Tab counts cover the whole company.
 */
export async function listWorkOrders(companyId: string, query: ListWorkOrdersQuery, asOf = new Date()) {
  const tab: Prisma.WorkOrderWhereInput =
    query.status === "overdue" ? overdueWhere(asOf) : query.status ? { status: query.status } : {};
  const search: Prisma.WorkOrderWhereInput = query.q
    ? { OR: [
        { orderNumber: { contains: query.q, mode: "insensitive" } },
        { material: { code: { contains: query.q, mode: "insensitive" } } },
        { material: { name: { contains: query.q, mode: "insensitive" } } },
      ] }
    : {};
  const where: Prisma.WorkOrderWhereInput = { companyId, AND: [tab, search] };

  const [orders, total, byStatus, overdue] = await Promise.all([
    prisma.workOrder.findMany({
      where, include: orderInclude,
      orderBy: [{ plannedStartDate: "desc" }, { orderNumber: "desc" }, { id: "desc" }],
      ...cursorArgs({ limit: query.limit ?? 50, cursor: query.cursor }),
    }),
    prisma.workOrder.count({ where }),
    prisma.workOrder.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
    prisma.workOrder.count({ where: { companyId, ...overdueWhere(asOf) } }),
  ]);

  const counts = Object.fromEntries(WORK_ORDER_STATUSES.map((s) => [s, 0])) as StatusCounts;
  for (const g of byStatus) counts[g.status] = g._count._all;
  counts.all = byStatus.reduce((s, g) => s + g._count._all, 0);
  counts.overdue = overdue;

  const page = pageOf(orders, query.limit ?? 50);
  const list: WorkOrderList = { asOf: asOf.toISOString(), orders: page.items.map((o) => toRow(o, asOf)), counts };
  return { list, nextCursor: page.nextCursor, total };
}

/**
 * One order with its operations, components (lot and material readiness)
 * and the lots it produced.
 */
export async function getWorkOrder(companyId: string, id: string, asOf = new Date()): Promise<WorkOrderDetail> {
  const order = await prisma.workOrder.findFirst({
    where: { id, companyId },
    include: {
      ...orderInclude,
      operations: { orderBy: { sequence: "asc" } },
      components: {
        include: {
          material: { select: { id: true, code: true, name: true, kind: true, unitOfMeasure: { select: { code: true } } } },
          lot: { select: { id: true, lotNumber: true, qcStatus: true } },
        },
        orderBy: { material: { code: "asc" } },
      },
    },
  });
  if (!order) throw AppError.notFound("Work order", id);

  const open = isOpen(order.status);
  const materialIds = order.components.map((c) => c.materialId);

  const [balances, produced] = await Promise.all([
    // The same on-hand figure Stock Overview reports for this location.
    open && materialIds.length
      ? prisma.inventoryBalance.findMany({
          where: { locationId: order.locationId, materialId: { in: materialIds }, material: { companyId } },
          select: { materialId: true, onHandQty: true },
        })
      : Promise.resolve([]),
    prisma.stockMovement.findMany({
      where: {
        type: StockMovementType.PRODUCTION_RECEIPT,
        referenceType: MOVEMENT_REF.WORK_ORDER,
        referenceId: order.id,
        lotId: { not: null },
        material: { companyId },
      },
      select: { quantity: true, occurredAt: true, lot: { select: { id: true, lotNumber: true, qcStatus: true } } },
      orderBy: { occurredAt: "asc" },
    }),
  ]);
  const onHand = new Map(balances.map((b) => [b.materialId, toNumber(b.onHandQty)]));

  const components = order.components.map((c) => {
    const required = toNumber(c.requiredQty);
    const issued = toNumber(c.issuedQty);
    return {
      material: { id: c.material.id, code: c.material.code, name: c.material.name, kind: c.material.kind },
      uom: c.material.unitOfMeasure.code,
      requiredQty: required,
      issuedQty: issued,
      requiredDate: isoDate(c.requiredDate)!,
      lot: c.lot,
      readiness: open ? componentReadiness(required, issued, onHand.get(c.materialId) ?? 0) : null,
    };
  });

  return {
    ...toRow(order, asOf),
    notes: order.notes,
    operations: order.operations.map((op) => ({
      sequence: op.sequence,
      name: op.name,
      workCentre: op.workCentre,
      status: op.status,
      setupMinutes: toNumber(op.setupMinutes),
      runMinutes: toNumber(op.runMinutes),
    })),
    components,
    outputLots: produced.flatMap((m) => (m.lot
      ? [{ id: m.lot.id, lotNumber: m.lot.lotNumber, quantity: toNumber(m.quantity), qcStatus: m.lot.qcStatus, producedAt: isoDate(m.occurredAt)! }]
      : [])),
    shortComponents: open ? components.filter((c) => c.readiness?.status === "short").length : null,
  };
}
