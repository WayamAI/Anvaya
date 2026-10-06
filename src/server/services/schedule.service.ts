import { prisma } from "@/server/db/client";
import { toNumber } from "@/server/api/decimal";
import { componentReadiness, isOpen } from "@/server/production/work-orders";
import { buildSchedule, type ScheduleOrderInput, type ScheduleView, type StoredConstraint } from "@/server/production/schedule";
import { allWorkOrderRows } from "./work-order.service";

/**
 * Production schedule — read side. Built on the work order list, so status,
 * overdue and readiness mean exactly what the Work Orders page shows; adds
 * each order's operation times and the company's stored constraints.
 */
export async function getProductionSchedule(companyId: string, asOf = new Date()): Promise<ScheduleView> {
  const [orders, details, constraints] = await Promise.all([
    allWorkOrderRows(companyId, asOf),
    prisma.workOrder.findMany({
      where: { companyId },
      select: {
        id: true,
        operations: { select: { sequence: true, workCentre: true, setupMinutes: true, runMinutes: true } },
        components: {
          select: {
            materialId: true, requiredQty: true, issuedQty: true,
            material: { select: { code: true, name: true, unitOfMeasure: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.productionConstraint.findMany({
      where: { companyId, isActive: true },
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  const detailById = new Map(details.map((d) => [d.id, d]));
  const open = orders.filter((o) => isOpen(o.status));

  // Stock for every component of every open order, at that order's location
  // — the same on-hand figure Stock Overview and Work Orders use.
  const materialIds = [...new Set(open.flatMap((o) => detailById.get(o.id)?.components.map((c) => c.materialId) ?? []))];
  const locationIds = [...new Set(open.map((o) => o.location.id))];
  const balances = materialIds.length
    ? await prisma.inventoryBalance.findMany({
        where: { materialId: { in: materialIds }, locationId: { in: locationIds }, material: { companyId } },
        select: { materialId: true, locationId: true, onHandQty: true },
      })
    : [];
  const onHand = new Map(balances.map((b) => [`${b.materialId}|${b.locationId}`, toNumber(b.onHandQty)]));

  const inputs: ScheduleOrderInput[] = orders.map((o) => {
    const d = detailById.get(o.id);
    const shortages = isOpen(o.status)
      ? (d?.components ?? []).flatMap((c) => {
          const r = componentReadiness(toNumber(c.requiredQty), toNumber(c.issuedQty), onHand.get(`${c.materialId}|${o.location.id}`) ?? 0);
          return r.status === "short"
            ? [{ materialId: c.materialId, code: c.material.code, name: c.material.name, uom: c.material.unitOfMeasure.code, shortfall: r.shortfall }]
            : [];
        })
      : null;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      product: o.product,
      uom: o.uom,
      location: o.location,
      plannedQty: o.plannedQty,
      plannedStartDate: o.plannedStartDate,
      plannedEndDate: o.plannedEndDate,
      status: o.status,
      overdue: o.overdue,
      operations: (d?.operations ?? []).map((op) => ({
        sequence: op.sequence, workCentre: op.workCentre,
        setupMinutes: toNumber(op.setupMinutes), runMinutes: toNumber(op.runMinutes),
      })),
      shortages,
    };
  });

  const stored: StoredConstraint[] = constraints.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    location: c.location,
    unit: c.unit,
    capacity: toNumber(c.capacity),
    utilised: toNumber(c.utilised),
    effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: c.effectiveTo ? c.effectiveTo.toISOString().slice(0, 10) : null,
  }));

  return buildSchedule(inputs, stored, asOf);
}
