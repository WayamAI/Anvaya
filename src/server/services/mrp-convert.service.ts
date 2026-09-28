import { AuditAction, MrpRunStatus, PlannedOrderStatus } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { companyContext, isoDate } from "@/server/config/business-date";
import { runInTransaction } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { maxDate } from "@/server/planning/dates";
import { createPurchaseOrderTx } from "./purchase-order-write.service";
import { createWorkOrderTx } from "./work-order-write.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Turn planned orders into real orders — all of them or none.
 *
 * Purchases are grouped by suggested vendor and delivery location into one
 * DRAFT purchase order each (a material planned several times becomes one
 * line with the summed quantity, due at the earliest date). Production
 * becomes one PLANNED work order per planned order, its components taken
 * from the active BOM like any other work order. The resulting orders then
 * follow their normal approval and release flow.
 *
 * Only the latest completed run's orders can be converted: an older run's
 * plan is superseded, and acting on it would double up supply the newer run
 * has already accounted for. Dates already past are moved to today.
 *
 * Conversion needs `mrp:run`, and `purchase-order:create` or
 * `work-order:create` for what is being created.
 */

export interface ConvertResult {
  purchaseOrders: { id: string; orderNumber: string; lines: number }[];
  workOrders: { id: string; orderNumber: string }[];
}

export async function convertPlannedOrders(runId: string, plannedOrderIds: string[], ctx: WriteContext): Promise<ConvertResult> {
  requirePermission(ctx.actor, "mrp:run");
  const companyId = ctx.actor.companyId;

  return runInTransaction(async (tx) => {
    const run = await tx.mrpRun.findFirst({ where: { id: runId, companyId }, select: { id: true, runNumber: true, status: true, completedAt: true } });
    if (!run) throw AppError.notFound("MRP run", runId);
    const latest = await tx.mrpRun.findFirst({ where: { companyId, status: MrpRunStatus.COMPLETED }, orderBy: { completedAt: "desc" }, select: { id: true, runNumber: true } });
    if (!latest || latest.id !== run.id) {
      throw AppError.conflict(`${run.runNumber} has been superseded${latest ? ` by ${latest.runNumber}` : ""}; convert from the latest run`);
    }

    // Lock the planned orders so two people converting at once cannot both succeed.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "planned_orders" WHERE "mrpRunId" = ${run.id} AND id = ANY(${plannedOrderIds}::text[]) ORDER BY id FOR UPDATE`;
    if (locked.length !== plannedOrderIds.length) {
      throw AppError.unprocessable("Some planned orders are not part of this run", [{ path: "plannedOrderIds", message: "not found in the run" }]);
    }
    const orders = await tx.plannedOrder.findMany({
      where: { id: { in: plannedOrderIds } },
      include: { material: { select: { code: true } } },
      orderBy: [{ requiredDate: "asc" }],
    });

    const problems: ErrorDetail[] = [];
    orders.forEach((o) => {
      const i = plannedOrderIds.indexOf(o.id);
      if (o.status !== PlannedOrderStatus.PLANNED && o.status !== PlannedOrderStatus.FIRMED) {
        problems.push({ path: `plannedOrderIds.${i}`, message: `${o.material.code} is already ${o.status.toLowerCase()}` });
      } else if (o.type === "PURCHASE" && !o.suggestedVendorId) {
        problems.push({ path: `plannedOrderIds.${i}`, message: `${o.material.code} has no vendor to order from; choose a preferred vendor and re-run` });
      }
    });
    if (problems.length) throw AppError.unprocessable("Some planned orders cannot be converted", problems);

    const { today } = await companyContext(companyId, tx);
    const result: ConvertResult = { purchaseOrders: [], workOrders: [] };

    // Purchases: one draft PO per vendor and location.
    const groups = new Map<string, typeof orders>();
    for (const o of orders.filter((x) => x.type === "PURCHASE")) {
      const k = `${o.suggestedVendorId}|${o.locationId}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
    }
    for (const group of groups.values()) {
      const byMaterial = new Map<string, { qty: number; date: string }>();
      for (const o of group) {
        const prev = byMaterial.get(o.materialId);
        const date = maxDate(isoDate(o.requiredDate), today);
        byMaterial.set(o.materialId, {
          qty: Math.round(((prev?.qty ?? 0) + o.quantity.toNumber()) * 1e6) / 1e6,
          date: prev && prev.date < date ? prev.date : date,
        });
      }
      const lines = [...byMaterial].map(([materialId, v]) => ({ materialId, orderedQty: v.qty, expectedDeliveryDate: v.date }));
      const po = await createPurchaseOrderTx(tx, {
        vendorId: group[0].suggestedVendorId!, locationId: group[0].locationId, orderDate: today,
        expectedDeliveryDate: lines.map((l) => l.expectedDeliveryDate).sort()[0],
        notes: `Raised from ${run.runNumber}`, lines,
      }, ctx);
      result.purchaseOrders.push({ ...po, lines: lines.length });
      await tx.plannedOrder.updateMany({
        where: { id: { in: group.map((o) => o.id) } },
        data: { status: PlannedOrderStatus.CONVERTED, convertedToPurchaseOrderId: po.id, convertedAt: new Date() },
      });
    }

    // Production: one work order each.
    for (const o of orders.filter((x) => x.type === "PRODUCTION")) {
      const start = maxDate(isoDate(o.releaseDate), today);
      const end = maxDate(isoDate(o.requiredDate), start);
      const wo = await createWorkOrderTx(tx, {
        materialId: o.materialId, locationId: o.locationId, plannedQty: o.quantity.toNumber(),
        plannedStartDate: start, plannedEndDate: end, notes: `Raised from ${run.runNumber}`,
      }, ctx);
      result.workOrders.push(wo);
      await tx.plannedOrder.update({
        where: { id: o.id },
        data: { status: PlannedOrderStatus.CONVERTED, convertedToWorkOrderId: wo.id, convertedAt: new Date() },
      });
    }

    await recordAudit({
      ...auditMeta(ctx), tx, mrpRunId: run.id,
      action: AuditAction.CREATE, entityType: "planned_orders", entityId: run.id, entityLabel: `${run.runNumber} conversion`,
      newValues: {
        plannedOrders: plannedOrderIds.length,
        purchaseOrders: result.purchaseOrders.map((p) => p.orderNumber),
        workOrders: result.workOrders.map((w) => w.orderNumber),
      },
    });
    return result;
  }, { timeoutMs: 60_000 });
}
