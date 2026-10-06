import { createHash } from "node:crypto";
import { AuditAction, MrpRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { planningAsOf } from "@/server/config/as-of";
import { companyContext, dateOnly, isoDate, yearOf } from "@/server/config/business-date";
import { env } from "@/server/config/env";
import { getSetting } from "@/server/config/company-settings";
import { nextDocumentNumber } from "@/server/db/sequence";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { addDays } from "@/server/planning/dates";
import { independentDemand, type DemandEvent } from "@/server/planning/demand";
import { runMrp, type EngineInput, type EngineOutput } from "@/server/planning/mrp-engine";
import { resolveRunDate } from "@/server/planning/run-date";
import { usableStock } from "@/server/planning/supply";
import { OPEN_PO_STATUSES } from "@/server/purchasing/purchase-orders";
import type { StartRunInput } from "@/server/validation/mrp";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Running MRP: snapshot the inputs, run the engine, store the plan.
 *
 * Lifecycle: a run row is created RUNNING in its own short transaction
 * (after locking the company row and checking no other run is in flight),
 * the inputs are read in one REPEATABLE READ transaction so the plan never
 * sees half of a concurrent receipt, the engine runs in memory, and the
 * results are written with the run's completion in a single transaction. A
 * failure marks the run FAILED with its message; nothing partial is kept.
 *
 * One run per company at a time. A RUNNING run older than STALE_AFTER_MS
 * (a crashed server) no longer blocks and is marked FAILED by the next run.
 *
 * Runs are regenerative: each plans from scratch. Earlier runs stay as
 * history; only the latest completed run's planned orders can be converted.
 */

const STALE_AFTER_MS = 10 * 60_000;
const CHUNK = 1000;

const num = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? 0 : v.toNumber());

/* ---- Snapshot ---------------------------------------------------------------- */

export interface Snapshot {
  input: EngineInput;
  forecastUse: ReturnType<typeof independentDemand>["forecastUse"];
}

export async function loadSnapshot(
  companyId: string,
  params: {
    asOf: string; horizonDays: number; bucketSizeDays: number; includeForecast: boolean; respectSafetyStock: boolean;
    /** The company's `mrp.rescheduleInToleranceDays`; 0 when omitted. */
    rescheduleInToleranceDays?: number;
  },
): Promise<Snapshot> {
  const horizonEnd = addDays(params.asOf, params.horizonDays);
  const OPEN_SO = ["CONFIRMED", "PROCESSING"] as const;
  /** No longer demand, but still consumes forecast for the days they were booked for. */
  const CLOSED_SO = ["DISPATCHED", "DELIVERED", "CANCELLED"] as const;
  const OPEN_WO = ["PLANNED", "FIRMED", "RELEASED", "IN_PROGRESS"] as const;

  return prisma.$transaction(async (tx) => {
    const [materials, locations, policies, versions, vendorMaterials, balances, poLines, workOrders, soLines, forecastPeriods, expiredLots, awaitingQc] = await Promise.all([
      tx.material.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, unitOfMeasureId: true, unitOfMeasure: { select: { code: true } } } }),
      tx.location.findMany({ where: { companyId, isActive: true }, select: { id: true, isManufacturing: true } }),
      tx.materialLocationPolicy.findMany({ where: { isActive: true, material: { companyId, isActive: true }, location: { isActive: true } } }),
      tx.bomVersion.findMany({
        where: { isActive: true, bom: { companyId } },
        select: {
          id: true, baseQuantity: true, bom: { select: { materialId: true } },
          components: { select: { materialId: true, quantity: true, scrapFactor: true, leadTimeOffsetDays: true, isOptional: true, unitOfMeasureId: true, material: { select: { unitOfMeasureId: true } } } },
        },
      }),
      // Only suppliers a PO could actually be approved to.
      tx.vendorMaterial.findMany({
        where: { isActive: true, vendor: { companyId, isActive: true, isApproved: true } },
        select: { materialId: true, leadTimeDays: true, isPreferred: true, minOrderQty: true, orderMultiple: true, vendor: { select: { id: true, code: true, name: true } } },
      }),
      tx.inventoryBalance.findMany({ where: { material: { companyId }, location: { isActive: true } }, select: { materialId: true, locationId: true, onHandQty: true, quarantineQty: true } }),
      // Drafts count too: a draft is supply someone has committed to raising
      // (MRP's own conversions start as drafts). Leaving them out would plan
      // the same need again on the next run, before the draft is approved.
      tx.purchaseOrderLine.findMany({
        where: { purchaseOrder: { companyId, status: { in: [...OPEN_PO_STATUSES, "DRAFT"] } } },
        select: { id: true, materialId: true, orderedQty: true, receivedQty: true, expectedDeliveryDate: true, purchaseOrder: { select: { orderNumber: true, locationId: true } } },
      }),
      tx.workOrder.findMany({
        where: { companyId, status: { in: [...OPEN_WO] } },
        select: {
          id: true, orderNumber: true, materialId: true, locationId: true, plannedQty: true, producedQty: true, plannedEndDate: true,
          components: { select: { id: true, materialId: true, requiredQty: true, issuedQty: true, requiredDate: true } },
        },
      }),
      // Open lines are demand. Closed ones are read only for the planning
      // window, where they consume forecast.
      tx.salesOrderLine.findMany({
        where: {
          salesOrder: { companyId },
          OR: [
            { salesOrder: { status: { in: [...OPEN_SO] } } },
            { salesOrder: { status: { in: [...CLOSED_SO] } }, requiredDate: { gte: dateOnly(params.asOf), lte: dateOnly(horizonEnd) } },
          ],
        },
        select: { id: true, materialId: true, locationId: true, quantity: true, shippedQty: true, requiredDate: true, salesOrder: { select: { orderNumber: true, status: true } } },
      }),
      tx.forecastPeriod.findMany({
        where: { forecast: { companyId, isActive: true }, periodEnd: { gte: dateOnly(params.asOf) }, periodStart: { lte: dateOnly(horizonEnd) } },
        select: { id: true, periodStart: true, periodEnd: true, forecastQty: true, forecast: { select: { name: true, materialId: true, locationId: true } } },
      }),
      // Released lots past their expiry: still on hand, but dispatch and issue
      // refuse them. Held lots are already outside usable stock.
      tx.inventoryLot.findMany({
        where: { material: { companyId }, location: { isActive: true }, qcStatus: "APPROVED", remainingQty: { gt: 0 }, expiryDate: { lt: dateOnly(params.asOf) } },
        select: { materialId: true, locationId: true, remainingQty: true },
      }),
      // Lots awaiting their QC decision, not yet expired: held stock that is
      // expected to be released. Lots put on hold (QUARANTINE) are not.
      tx.inventoryLot.findMany({
        where: {
          material: { companyId }, location: { isActive: true }, qcStatus: "PENDING", remainingQty: { gt: 0 },
          OR: [{ expiryDate: null }, { expiryDate: { gte: dateOnly(params.asOf) } }],
        },
        select: { id: true, lotNumber: true, materialId: true, locationId: true, remainingQty: true },
      }),
    ]);

    const { events, forecastUse } = independentDemand(
      soLines.map((l) => {
        const open = (OPEN_SO as readonly string[]).includes(l.salesOrder.status);
        return {
          id: l.id, reference: l.salesOrder.orderNumber, materialId: l.materialId, locationId: l.locationId,
          requiredDate: isoDate(l.requiredDate),
          openQty: open ? Math.max(0, num(l.quantity) - num(l.shippedQty)) : 0,
          // A cancelled order sold only what it shipped; any other sold its
          // quantity, or more where over-dispatch tolerance allowed it.
          bookedQty: l.salesOrder.status === "CANCELLED" ? num(l.shippedQty) : Math.max(num(l.quantity), num(l.shippedQty)),
        };
      }),
      forecastPeriods.map((p) => ({
        id: p.id, forecastName: p.forecast.name, materialId: p.forecast.materialId, locationId: p.forecast.locationId,
        periodStart: isoDate(p.periodStart), periodEnd: isoDate(p.periodEnd), forecastQty: num(p.forecastQty),
      })),
      params.asOf, horizonEnd, params.includeForecast,
    );

    // Unissued components of open work orders are demand already committed.
    const woDemand: DemandEvent[] = workOrders.flatMap((w) => w.components
      .map((c) => ({ c, open: num(c.requiredQty) - num(c.issuedQty) }))
      .filter(({ open }) => open > 0)
      .map(({ c, open }) => ({
        materialId: c.materialId, locationId: w.locationId, date: isoDate(c.requiredDate), qty: open,
        sourceType: "WORK_ORDER" as const, sourceId: c.id, reference: w.orderNumber,
      })));

    const vendorsByMaterial = new Map<string, EngineInput["vendors"][number]["options"]>();
    for (const v of vendorMaterials) {
      const list = vendorsByMaterial.get(v.materialId) ?? [];
      list.push({
        vendorId: v.vendor.id, code: v.vendor.code, name: v.vendor.name, leadTimeDays: v.leadTimeDays,
        isPreferred: v.isPreferred, minOrderQty: num(v.minOrderQty), orderMultiple: num(v.orderMultiple),
      });
      vendorsByMaterial.set(v.materialId, list);
    }
    const activeLocations = new Set(locations.map((l) => l.id));

    const input: EngineInput = {
      asOf: params.asOf, horizonDays: params.horizonDays, bucketSizeDays: params.bucketSizeDays, respectSafetyStock: params.respectSafetyStock,
      rescheduleInToleranceDays: params.rescheduleInToleranceDays ?? 0,
      items: materials.map((m) => ({ id: m.id, code: m.code, uom: m.unitOfMeasure.code })),
      policies: policies.map((p) => ({
        materialId: p.materialId, locationId: p.locationId, procurementType: p.procurementType, safetyStock: num(p.safetyStock),
        lotSizing: { rule: p.lotSizingRule, minOrderQty: num(p.minOrderQty), orderMultiple: num(p.orderMultiple), maxOrderQty: p.maxOrderQty ? num(p.maxOrderQty) : null },
        periodDays: p.periodDays, productionLeadTimeDays: p.productionLeadTimeDays, safetyLeadTimeDays: p.safetyLeadTimeDays,
      })),
      boms: versions.map((v) => ({
        materialId: v.bom.materialId, versionId: v.id, baseQuantity: num(v.baseQuantity),
        components: v.components.map((c) => ({
          materialId: c.materialId, quantity: num(c.quantity), scrapFactor: num(c.scrapFactor), leadTimeOffsetDays: c.leadTimeOffsetDays,
          isOptional: c.isOptional, unitMatches: c.unitOfMeasureId === c.material.unitOfMeasureId,
        })),
      })),
      vendors: [...vendorsByMaterial].map(([materialId, options]) => ({ materialId, options })),
      // Usable stock: neither held by quality nor expired.
      onHand: usableStock(
        balances.map((b) => ({ materialId: b.materialId, locationId: b.locationId, onHandQty: num(b.onHandQty), quarantineQty: num(b.quarantineQty) })),
        expiredLots.map((l) => ({ materialId: l.materialId, locationId: l.locationId, remainingQty: num(l.remainingQty) })),
      ),
      demand: [...events, ...woDemand].filter((d) => activeLocations.has(d.locationId)),
      receipts: [
        ...poLines
          .map((l) => ({ l, open: num(l.orderedQty) - num(l.receivedQty) }))
          .filter(({ open }) => open > 0)
          .map(({ l, open }) => ({
            materialId: l.materialId, locationId: l.purchaseOrder.locationId, date: isoDate(l.expectedDeliveryDate), qty: open,
            type: "PURCHASE_ORDER" as const, id: l.id, reference: l.purchaseOrder.orderNumber,
          })),
        ...workOrders
          .map((w) => ({ w, open: num(w.plannedQty) - num(w.producedQty) }))
          .filter(({ open }) => open > 0)
          .map(({ w, open }) => ({
            materialId: w.materialId, locationId: w.locationId, date: isoDate(w.plannedEndDate), qty: open,
            type: "WORK_ORDER" as const, id: w.id, reference: w.orderNumber,
          })),
        // Conditional supply: counted as arriving on the planning date, while
        // usable stock above still excludes it, so nothing can be issued or
        // shipped from it until quality releases it.
        ...awaitingQc.map((l) => ({
          materialId: l.materialId, locationId: l.locationId, date: params.asOf, qty: num(l.remainingQty),
          type: "QUALITY_INSPECTION" as const, id: l.id, reference: `${l.lotNumber} (awaiting QC)`,
        })),
      ],
      manufacturingLocationIds: locations.filter((l) => l.isManufacturing).map((l) => l.id),
    };
    return { input, forecastUse };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 });
}

/** Stable hash of what the engine saw: equal hashes mean identical inputs. */
export function hashInput(input: EngineInput): string {
  const { newId: _ignored, ...rest } = input;
  const sortDeep = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sortDeep).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("sha256").update(JSON.stringify(sortDeep(rest))).digest("hex");
}

/* ---- Run ------------------------------------------------------------------------ */

export async function startMrpRun(params: StartRunInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "mrp:run");
  const companyId = ctx.actor.companyId;
  const company = await companyContext(companyId);
  // A planning run plans from today; another date makes it a simulation.
  // PLANNING_AS_OF_DATE (the demo's date) cannot be set in production.
  const { asOf, isSimulation } = resolveRunDate({
    requestedAsOf: params.asOfDate, simulation: params.simulation ?? false, today: company.today,
    pinned: env.PLANNING_AS_OF_DATE ? isoDate(planningAsOf()) : undefined,
  });
  const settings = {
    asOf, horizonDays: params.horizonDays ?? 90, bucketSizeDays: params.bucketSizeDays ?? 1,
    includeForecast: params.includeForecast ?? true, respectSafetyStock: params.respectSafetyStock ?? true,
    // Stored with the run's parameters, so a plan can be explained later.
    rescheduleInToleranceDays: await getSetting(companyId, "mrp.rescheduleInToleranceDays"),
  };

  // 1. Claim the run.
  const run = await runInTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "companies" WHERE id = ${companyId} FOR UPDATE`;
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    await tx.mrpRun.updateMany({
      where: { companyId, status: MrpRunStatus.RUNNING, startedAt: { lt: staleBefore } },
      data: { status: MrpRunStatus.FAILED, errorMessage: "Abandoned: the server stopped before the run finished", completedAt: new Date() },
    });
    const busy = await tx.mrpRun.findFirst({ where: { companyId, status: MrpRunStatus.RUNNING }, select: { runNumber: true } });
    if (busy) throw AppError.conflict(`${busy.runNumber} is still running; wait for it to finish`);

    const runNumber = await nextDocumentNumber(tx, companyId, "MRP_RUN", yearOf(company.today));
    return tx.mrpRun.create({
      data: {
        companyId, runNumber, status: MrpRunStatus.RUNNING, asOfDate: dateOnly(asOf), isSimulation,
        horizonDays: settings.horizonDays, bucketSizeDays: settings.bucketSizeDays,
        triggeredById: ctx.actor.userId, startedAt: new Date(),
        parameters: {
          create: Object.entries({ ...settings, simulation: isSimulation }).map(([key, value]) => ({ key, value: value as Prisma.InputJsonValue })),
        },
      },
      select: { id: true, runNumber: true, startedAt: true },
    });
  });

  const started = performance.now();
  try {
    // 2. Snapshot and plan.
    const snapshot = await loadSnapshot(companyId, settings);
    const inputHash = hashInput(snapshot.input);
    const out = runMrp(snapshot.input);

    // 3. Store everything with the completion, or nothing.
    await runInTransaction((tx) => persist(tx, run.id, out), { timeoutMs: 120_000 });
    const durationMs = Math.round(performance.now() - started);
    await runInTransaction(async (tx) => {
      await tx.mrpRun.update({
        where: { id: run.id },
        data: {
          status: MrpRunStatus.COMPLETED, completedAt: new Date(), durationMs, inputHash,
          materialsPlanned: out.materialsPlanned, plannedOrderCount: out.plannedOrders.length, exceptionCount: out.exceptions.length,
        },
      });
      await recordAudit({
        ...auditMeta(ctx), tx, mrpRunId: run.id,
        action: AuditAction.MRP_RUN, entityType: "mrp_runs", entityId: run.id, entityLabel: run.runNumber,
        newValues: { ...settings, simulation: isSimulation, plannedOrders: out.plannedOrders.length, exceptions: out.exceptions.length, materialsPlanned: out.materialsPlanned, durationMs },
      });
    });
    logger.info({ runNumber: run.runNumber, durationMs, plannedOrders: out.plannedOrders.length }, "mrp run completed");
    return { id: run.id, runNumber: run.runNumber };
  } catch (error) {
    const message = AppError.is(error) ? error.message : (error as Error)?.message ?? String(error);
    logger.error({ err: error, runNumber: run.runNumber }, "mrp run failed");
    await prisma.mrpRun.update({
      where: { id: run.id },
      data: { status: MrpRunStatus.FAILED, errorMessage: message.slice(0, 2000), completedAt: new Date(), durationMs: Math.round(performance.now() - started) },
    }).catch(() => undefined);
    throw AppError.is(error) ? error : AppError.internal(`${run.runNumber} failed; the error is recorded on the run`, error);
  }
}

async function persist(tx: Prisma.TransactionClient, mrpRunId: string, out: EngineOutput) {
  const d = (iso: string) => dateOnly(iso);
  const dec = (n: number) => new Prisma.Decimal(n);

  for (let i = 0; i < out.requirements.length; i += CHUNK) {
    await tx.mrpRequirement.createMany({
      data: out.requirements.slice(i, i + CHUNK).map((r) => ({
        mrpRunId, materialId: r.materialId, locationId: r.locationId, lowLevelCode: r.lowLevelCode,
        bucketStart: d(r.bucketStart), bucketEnd: d(r.bucketEnd), grossRequirement: dec(r.grossRequirement),
        scheduledReceipts: dec(r.scheduledReceipts), projectedOnHand: dec(r.projectedOnHand), safetyStock: dec(r.safetyStock),
        netRequirement: dec(r.netRequirement), plannedReceipt: dec(r.plannedReceipt), plannedRelease: dec(r.plannedRelease),
      })),
    });
  }
  for (let i = 0; i < out.plannedOrders.length; i += CHUNK) {
    const batch = out.plannedOrders.slice(i, i + CHUNK);
    await tx.plannedOrder.createMany({
      data: batch.map((p) => ({
        id: p.id, mrpRunId, materialId: p.materialId, locationId: p.locationId, type: p.type, quantity: dec(p.quantity),
        releaseDate: d(p.releaseDate), requiredDate: d(p.requiredDate), leadTimeDays: p.leadTimeDays,
        leadTimeSource: p.leadTimeSource, suggestedVendorId: p.suggestedVendorId, lowLevelCode: p.lowLevelCode,
      })),
    });
    await tx.mrpExplanation.createMany({
      data: batch.map((p) => ({ mrpRunId, plannedOrderId: p.id, steps: p.explanation.steps as unknown as Prisma.InputJsonValue, summary: p.explanation.summary })),
    });
    await tx.mrpPegging.createMany({
      data: batch.flatMap((p) => p.pegs.map((g) => ({
        mrpRunId, plannedOrderId: p.id, demandSourceType: g.demandSourceType, demandSourceId: g.demandSourceId,
        demandReference: g.demandReference, quantity: dec(g.quantity), requiredDate: d(g.requiredDate),
        parentPlannedOrderId: g.parentPlannedOrderId,
      }))),
    });
  }
  for (let i = 0; i < out.exceptions.length; i += CHUNK) {
    await tx.mrpException.createMany({
      data: out.exceptions.slice(i, i + CHUNK).map((e) => ({
        mrpRunId, materialId: e.materialId, locationId: e.locationId, type: e.type, severity: e.severity, message: e.message,
        suggestedAction: e.suggestedAction, quantity: e.quantity === null ? null : dec(e.quantity),
        dueDate: e.dueDate ? d(e.dueDate) : null, daysLate: e.daysLate, referenceType: e.referenceType, referenceId: e.referenceId,
      })),
    });
  }
}

/* ---- Exceptions --------------------------------------------------------------- */

export async function resolveException(id: string, ctx: WriteContext) {
  requirePermission(ctx.actor, "mrp:run");
  await runInTransaction(async (tx) => {
    const e = await tx.mrpException.findFirst({ where: { id, mrpRun: { companyId: ctx.actor.companyId } }, include: { mrpRun: { select: { runNumber: true } } } });
    if (!e) throw AppError.notFound("Exception", id);
    if (e.isResolved) throw AppError.conflict("The exception is already resolved");
    await tx.mrpException.update({ where: { id }, data: { isResolved: true, resolvedAt: new Date() } });
    await recordAudit({
      ...auditMeta(ctx), tx, mrpRunId: e.mrpRunId,
      action: AuditAction.UPDATE, entityType: "mrp_exceptions", entityId: id, entityLabel: `${e.mrpRun.runNumber} ${e.type}`,
      newValues: { isResolved: true, message: e.message },
    });
  });
}

