import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import {
  componentReadiness, isOpen, isOverdue, statusCounts, traceCompleteness, workCentreRoute,
  type WorkOrderDetail, type WorkOrderList, type WorkOrderRow,
} from "@/server/production/work-orders";

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

/** Every work order, newest planned start first, with counts per tab. */
export async function listWorkOrders(companyId: string, asOf = new Date()): Promise<WorkOrderList> {
  const orders = await prisma.workOrder.findMany({
    where: { companyId },
    include: orderInclude,
    orderBy: [{ plannedStartDate: "desc" }, { orderNumber: "desc" }],
  });
  const rows = orders.map((o) => toRow(o, asOf));
  return { asOf: asOf.toISOString(), orders: rows, counts: statusCounts(rows) };
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
