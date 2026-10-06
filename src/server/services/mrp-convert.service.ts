import { AuditAction, MrpRunStatus, PlannedOrderStatus } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requireAnyPermission, requirePermission } from "@/server/auth/rbac";
import { companyContext, isoDate } from "@/server/config/business-date";
import { runInTransaction } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { draftPurchaseOrders } from "@/server/planning/conversion";
import { maxDate } from "@/server/planning/dates";
import { createPurchaseOrderTx } from "./purchase-order-write.service";
import { createWorkOrderTx } from "./work-order-write.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Turn planned orders into real orders — all of them or none.
 *
 * Purchases become DRAFT purchase orders grouped by suggested vendor and
 * delivery location, one line per planned order on its own date — never
 * summed or pulled forward (see `draftPurchaseOrders`). Production
 * becomes one PLANNED work order per planned order, its components taken
 * from the active BOM like any other work order. The resulting orders then
 * follow their normal approval and release flow.
 *
 * Only the latest completed planning run's orders can be converted: an older
 * run's plan is superseded, and acting on it would double up supply the newer
 * run has already accounted for. A simulation is never converted, and never
 * supersedes the plan. Dates already past are moved to today.
 *
 * Conversion is authorised by what it creates, not by the right to run MRP:
 * `purchase-order:create` for purchases (procurement raising draft POs from
 * the plan) and `work-order:create` for production (planners and the shop
 * floor). Running MRP and acting on its result are separate jobs.
 */

export interface ConvertResult {
  purchaseOrders: { id: string; orderNumber: string; lines: number }[];
  workOrders: { id: string; orderNumber: string }[];
}

export async function convertPlannedOrders(runId: string, plannedOrderIds: string[], ctx: WriteContext): Promise<ConvertResult> {
  requireAnyPermission(ctx.actor, ["purchase-order:create", "work-order:create"]);
  const companyId = ctx.actor.companyId;

  return runInTransaction(async (tx) => {
    const run = await tx.mrpRun.findFirst({ where: { id: runId, companyId }, select: { id: true, runNumber: true, status: true, completedAt: true, isSimulation: true } });
    if (!run) throw AppError.notFound("MRP run", runId);
    if (run.isSimulation) throw AppError.conflict(`${run.runNumber} is a simulation; only a planning run's orders can be converted`);
    const latest = await tx.mrpRun.findFirst({ where: { companyId, status: MrpRunStatus.COMPLETED, isSimulation: false }, orderBy: { completedAt: "desc" }, select: { id: true, runNumber: true } });
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

    // Refuse before creating anything, naming the right that is missing.
    if (orders.some((o) => o.type === "PURCHASE")) requirePermission(ctx.actor, "purchase-order:create");
    if (orders.some((o) => o.type === "PRODUCTION")) requirePermission(ctx.actor, "work-order:create");

    // A product with no active BOM cannot become a work order; say so per line, up front.
    const makeIds = [...new Set(orders.filter((o) => o.type === "PRODUCTION").map((o) => o.materialId))];
    const withBom = new Set(makeIds.length
      ? (await tx.bomVersion.findMany({ where: { isActive: true, bom: { companyId, materialId: { in: makeIds } } }, select: { bom: { select: { materialId: true } } } })).map((v) => v.bom.materialId)
      : []);

    const problems: ErrorDetail[] = [];
    orders.forEach((o) => {
      const i = plannedOrderIds.indexOf(o.id);
      if (o.status !== PlannedOrderStatus.PLANNED && o.status !== PlannedOrderStatus.FIRMED) {
        problems.push({ path: `plannedOrderIds.${i}`, message: `${o.material.code} is already ${o.status.toLowerCase()}` });
      } else if (o.type === "PURCHASE" && !o.suggestedVendorId) {
        problems.push({ path: `plannedOrderIds.${i}`, message: `${o.material.code} has no vendor to order from; choose a preferred vendor and re-run` });
      } else if (o.type === "PRODUCTION" && !withBom.has(o.materialId)) {
        problems.push({ path: `plannedOrderIds.${i}`, message: `${o.material.code} has no active BOM to make it from; activate a BOM version first` });
      }
    });
    if (problems.length) throw AppError.unprocessable("Some planned orders cannot be converted", problems);

    const { today } = await companyContext(companyId, tx);
    const result: ConvertResult = { purchaseOrders: [], workOrders: [] };

    // Purchases: draft POs per vendor and location, one line per planned order.
    const drafts = draftPurchaseOrders(
      orders.filter((o) => o.type === "PURCHASE").map((o) => ({
        id: o.id, materialId: o.materialId, materialCode: o.material.code, vendorId: o.suggestedVendorId!,
        locationId: o.locationId, quantity: o.quantity.toNumber(), requiredDate: isoDate(o.requiredDate),
      })),
      today,
    );
    for (const draft of drafts) {
      const po = await createPurchaseOrderTx(tx, {
        vendorId: draft.vendorId, locationId: draft.locationId, orderDate: today,
        expectedDeliveryDate: draft.lines.map((l) => l.expectedDeliveryDate).sort()[0],
        notes: `Raised from ${run.runNumber}`,
        lines: draft.lines.map(({ materialId, orderedQty, expectedDeliveryDate }) => ({ materialId, orderedQty, expectedDeliveryDate })),
      }, ctx);
      result.purchaseOrders.push({ ...po, lines: draft.lines.length });
      await tx.plannedOrder.updateMany({
        where: { id: { in: draft.lines.map((l) => l.plannedOrderId) } },
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
