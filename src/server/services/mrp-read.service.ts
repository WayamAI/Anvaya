import { MrpRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { toNumber } from "@/server/api/decimal";
import { cursorArgs, pageOf } from "@/server/api/pagination";
import { isoDate } from "@/server/config/business-date";
import { AppError } from "@/server/errors/app-error";
import { daysBetween, r6 } from "@/server/planning/dates";
import type { PlannedOrdersQuery } from "@/server/validation/mrp";

/**
 * MRP results — read side. Every query is scoped to the caller's company
 * through the run; `runId` may be "latest" for the newest completed planning
 * run. Simulations are readable by id but never "latest".
 */

/** The newest completed run that is the plan rather than a what-if. */
const LATEST_PLAN = (companyId: string) => ({ companyId, status: MrpRunStatus.COMPLETED, isSimulation: false });

const num = (v: Prisma.Decimal | null) => (v === null ? null : toNumber(v));

export async function resolveRunId(companyId: string, runId: string): Promise<string> {
  const run = runId === "latest"
    ? await prisma.mrpRun.findFirst({ where: LATEST_PLAN(companyId), orderBy: { completedAt: "desc" }, select: { id: true } })
    : await prisma.mrpRun.findFirst({ where: { id: runId, companyId }, select: { id: true } });
  if (!run) throw AppError.notFound(runId === "latest" ? "Completed MRP run" : "MRP run", runId === "latest" ? undefined : runId);
  return run.id;
}

async function latestCompletedId(companyId: string) {
  return (await prisma.mrpRun.findFirst({ where: LATEST_PLAN(companyId), orderBy: { completedAt: "desc" }, select: { id: true } }))?.id ?? null;
}

const runSelect = {
  id: true, runNumber: true, status: true, asOfDate: true, horizonDays: true, bucketSizeDays: true, isSimulation: true,
  startedAt: true, completedAt: true, durationMs: true, errorMessage: true, inputHash: true,
  materialsPlanned: true, plannedOrderCount: true, exceptionCount: true,
  triggeredBy: { select: { name: true } },
} satisfies Prisma.MrpRunSelect;

type RunRow = Prisma.MrpRunGetPayload<{ select: typeof runSelect }>;

const toRun = (r: RunRow, latestId: string | null) => ({
  id: r.id, runNumber: r.runNumber, status: r.status, asOfDate: isoDate(r.asOfDate),
  horizonDays: r.horizonDays, bucketSizeDays: r.bucketSizeDays, isSimulation: r.isSimulation, triggeredBy: r.triggeredBy.name,
  startedAt: r.startedAt?.toISOString() ?? null, completedAt: r.completedAt?.toISOString() ?? null,
  durationMs: r.durationMs, errorMessage: r.errorMessage, inputHash: r.inputHash,
  materialsPlanned: r.materialsPlanned, plannedOrderCount: r.plannedOrderCount, exceptionCount: r.exceptionCount,
  isLatest: r.id === latestId,
});

/** Run history, newest first, cursor-paged (25 a page by default). */
export async function pageRuns(companyId: string, query: { limit?: number; cursor?: string } = {}) {
  const limit = query.limit ?? 25;
  const [runs, latestId, total] = await Promise.all([
    prisma.mrpRun.findMany({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorArgs({ limit, cursor: query.cursor }), select: runSelect }),
    latestCompletedId(companyId),
    prisma.mrpRun.count({ where: { companyId } }),
  ]);
  const page = pageOf(runs, limit);
  return { items: page.items.map((r) => toRun(r, latestId)), nextCursor: page.nextCursor, total };
}

export async function listRuns(companyId: string, limit = 25) {
  return (await pageRuns(companyId, { limit })).items;
}

export async function getRun(companyId: string, runId: string) {
  const id = await resolveRunId(companyId, runId);
  const [run, latestId, params, byType, bySeverity, orders] = await Promise.all([
    prisma.mrpRun.findUniqueOrThrow({ where: { id }, select: runSelect }),
    latestCompletedId(companyId),
    prisma.mrpRunParameter.findMany({ where: { mrpRunId: id }, select: { key: true, value: true } }),
    prisma.mrpException.groupBy({ by: ["type"], where: { mrpRunId: id, isResolved: false }, _count: { _all: true } }),
    prisma.mrpException.groupBy({ by: ["severity"], where: { mrpRunId: id, isResolved: false }, _count: { _all: true } }),
    prisma.plannedOrder.groupBy({ by: ["type", "status"], where: { mrpRunId: id }, _count: { _all: true }, _sum: { quantity: true } }),
  ]);
  return {
    ...toRun(run, latestId),
    parameters: Object.fromEntries(params.map((p) => [p.key, p.value])),
    openExceptions: {
      byType: Object.fromEntries(byType.map((g) => [g.type, g._count._all])),
      bySeverity: Object.fromEntries(bySeverity.map((g) => [g.severity, g._count._all])),
    },
    plannedOrders: orders.map((g) => ({ type: g.type, status: g.status, count: g._count._all })),
  };
}

/* ---- Planned orders --------------------------------------------------------------- */

type PlannedOrdersPage = Partial<PlannedOrdersQuery> & { limit?: number; cursor?: string };

/** A run's planned orders, release date first, cursor-paged (100 a page by default, at most 500). */
export async function pagePlannedOrders(companyId: string, runId: string, query: PlannedOrdersPage) {
  const id = await resolveRunId(companyId, runId);
  const limit = query.limit ?? 100;
  const where: Prisma.PlannedOrderWhereInput = {
    mrpRunId: id,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.materialId ? { materialId: query.materialId } : {}),
    ...(query.q ? { material: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } } : {}),
  };
  const [rows, total] = await Promise.all([prisma.plannedOrder.findMany({
    where,
    orderBy: [{ releaseDate: "asc" }, { lowLevelCode: "asc" }, { id: "asc" }],
    ...cursorArgs({ limit, cursor: query.cursor }),
    include: {
      material: { select: { id: true, code: true, name: true, kind: true, unitOfMeasure: { select: { code: true } } } },
      location: { select: { id: true, code: true, name: true } },
      explanation: { select: { summary: true } },
      peggings: { select: { demandSourceType: true, demandReference: true, quantity: true } },
    },
  }), prisma.plannedOrder.count({ where })]);
  const { items: orders, nextCursor } = pageOf(rows, limit);

  const vendorIds = [...new Set(orders.map((o) => o.suggestedVendorId).filter((v): v is string => !!v))];
  const poIds = orders.map((o) => o.convertedToPurchaseOrderId).filter((v): v is string => !!v);
  const woIds = orders.map((o) => o.convertedToWorkOrderId).filter((v): v is string => !!v);
  const makeIds = [...new Set(orders.filter((o) => o.type === "PRODUCTION").map((o) => o.materialId))];
  const [vendors, prices, pos, wos, run, boms] = await Promise.all([
    prisma.vendor.findMany({ where: { id: { in: vendorIds }, companyId }, select: { id: true, code: true, name: true } }),
    prisma.vendorMaterial.findMany({
      where: { vendorId: { in: vendorIds }, materialId: { in: [...new Set(orders.map((o) => o.materialId))] }, vendor: { companyId } },
      select: { vendorId: true, materialId: true, unitPrice: true, currencyCode: true },
    }),
    prisma.purchaseOrder.findMany({ where: { id: { in: poIds }, companyId }, select: { id: true, orderNumber: true } }),
    prisma.workOrder.findMany({ where: { id: { in: woIds }, companyId }, select: { id: true, orderNumber: true } }),
    prisma.mrpRun.findUniqueOrThrow({ where: { id }, select: { asOfDate: true } }),
    makeIds.length
      ? prisma.bomVersion.findMany({ where: { isActive: true, bom: { companyId, materialId: { in: makeIds } } }, select: { bom: { select: { materialId: true } } } })
      : [],
  ]);
  const hasBom = new Set(boms.map((b) => b.bom.materialId));
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const priceOf = new Map(prices.filter((p) => p.unitPrice !== null).map((p) => [`${p.vendorId}|${p.materialId}`, { unitPrice: toNumber(p.unitPrice!), currencyCode: p.currencyCode }]));
  const docById = new Map([...pos, ...wos].map((d) => [d.id, d.orderNumber]));
  const asOf = isoDate(run.asOfDate);

  const items = orders.map((o) => ({
    id: o.id, type: o.type, status: o.status,
    material: { id: o.material.id, code: o.material.code, name: o.material.name, kind: o.material.kind },
    uom: o.material.unitOfMeasure.code, location: o.location,
    quantity: toNumber(o.quantity), releaseDate: isoDate(o.releaseDate), requiredDate: isoDate(o.requiredDate),
    leadTimeDays: o.leadTimeDays, leadTimeSource: o.leadTimeSource, lowLevelCode: o.lowLevelCode,
    vendor: o.suggestedVendorId ? vendorById.get(o.suggestedVendorId) ?? null : null,
    /** The suggested vendor's list price for the material, when it has one: an estimate, not a quote. */
    price: o.suggestedVendorId ? priceOf.get(`${o.suggestedVendorId}|${o.materialId}`) ?? null : null,
    pastDue: isoDate(o.releaseDate) < asOf,
    /** Why it cannot be converted as things stand; null when it can (if still planned). */
    blocker: o.type === "PURCHASE"
      ? (o.suggestedVendorId ? null : "No vendor on file for this material")
      : (hasBom.has(o.materialId) ? null : "No active BOM to make it from"),
    summary: o.explanation?.summary ?? null,
    demands: [...new Set(o.peggings.map((p) => p.demandReference ?? p.demandSourceType))],
    convertedTo: o.convertedToPurchaseOrderId
      ? { type: "PURCHASE_ORDER", id: o.convertedToPurchaseOrderId, number: docById.get(o.convertedToPurchaseOrderId) ?? null }
      : o.convertedToWorkOrderId
        ? { type: "WORK_ORDER", id: o.convertedToWorkOrderId, number: docById.get(o.convertedToWorkOrderId) ?? null }
        : null,
  }));
  return { items, nextCursor, total };
}

/** The first page of a run's planned orders; `pagePlannedOrders` for the rest. */
export async function listPlannedOrders(companyId: string, runId: string, query: PlannedOrdersPage) {
  return (await pagePlannedOrders(companyId, runId, query)).items;
}

/** One planned order: its explanation, what it is pegged to, and the demand it creates below. */
export async function getPlannedOrder(companyId: string, id: string) {
  const o = await prisma.plannedOrder.findFirst({
    where: { id, mrpRun: { companyId } },
    include: {
      material: { select: { code: true, name: true, unitOfMeasure: { select: { code: true } } } },
      location: { select: { name: true } },
      explanation: true,
      peggings: { orderBy: { requiredDate: "asc" } },
    },
  });
  if (!o) throw AppError.notFound("Planned order", id);

  const parentIds = o.peggings.map((p) => p.parentPlannedOrderId).filter((v): v is string => !!v);
  const [parents, children] = await Promise.all([
    prisma.plannedOrder.findMany({ where: { id: { in: parentIds } }, select: { id: true, quantity: true, material: { select: { code: true, name: true } } } }),
    prisma.mrpPegging.findMany({
      where: { parentPlannedOrderId: o.id },
      select: { quantity: true, plannedOrder: { select: { id: true, type: true, quantity: true, material: { select: { code: true, name: true, unitOfMeasure: { select: { code: true } } } } } } },
    }),
  ]);
  const parentById = new Map(parents.map((p) => [p.id, p]));

  return {
    id: o.id, type: o.type, status: o.status, material: o.material.code, materialName: o.material.name, uom: o.material.unitOfMeasure.code,
    location: o.location.name, quantity: toNumber(o.quantity), releaseDate: isoDate(o.releaseDate), requiredDate: isoDate(o.requiredDate),
    leadTimeDays: o.leadTimeDays, leadTimeSource: o.leadTimeSource,
    explanation: o.explanation ? { summary: o.explanation.summary, steps: o.explanation.steps } : null,
    pegging: o.peggings.map((p) => ({
      demandSourceType: p.demandSourceType, reference: p.demandReference, quantity: toNumber(p.quantity), requiredDate: isoDate(p.requiredDate),
      parent: p.parentPlannedOrderId && parentById.get(p.parentPlannedOrderId)
        ? { id: p.parentPlannedOrderId, material: parentById.get(p.parentPlannedOrderId)!.material.code, quantity: toNumber(parentById.get(p.parentPlannedOrderId)!.quantity) }
        : null,
    })),
    components: children.map((c) => ({
      plannedOrderId: c.plannedOrder.id, type: c.plannedOrder.type, material: c.plannedOrder.material.code,
      materialName: c.plannedOrder.material.name, uom: c.plannedOrder.material.unitOfMeasure.code, quantity: toNumber(c.quantity),
    })),
  };
}

/* ---- Exceptions -------------------------------------------------------------------- */

/**
 * A run's exceptions: open first, then most severe (the enum is declared
 * LOW to CRITICAL, so descending), then soonest due with undated ones first.
 * Cursor-paged, 100 a page by default, at most 500.
 */
export async function pageExceptions(companyId: string, runId: string, query: { limit?: number; cursor?: string } = {}) {
  const id = await resolveRunId(companyId, runId);
  const limit = query.limit ?? 100;
  const [rows, total] = await Promise.all([
    prisma.mrpException.findMany({
      where: { mrpRunId: id },
      include: { material: { select: { id: true, code: true, name: true } }, location: { select: { id: true, name: true } } },
      orderBy: [{ isResolved: "asc" }, { severity: "desc" }, { dueDate: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      ...cursorArgs({ limit, cursor: query.cursor }),
    }),
    prisma.mrpException.count({ where: { mrpRunId: id } }),
  ]);
  const page = pageOf(rows, limit);
  return {
    items: page.items.map((e) => ({
      id: e.id, type: e.type, severity: e.severity, message: e.message, suggestedAction: e.suggestedAction,
      material: e.material, location: e.location, quantity: num(e.quantity), dueDate: e.dueDate ? isoDate(e.dueDate) : null,
      daysLate: e.daysLate, referenceType: e.referenceType, referenceId: e.referenceId,
      isResolved: e.isResolved, resolvedAt: e.resolvedAt?.toISOString() ?? null,
    })),
    nextCursor: page.nextCursor,
    total,
  };
}

/** The first page of a run's exceptions; `pageExceptions` for the rest. */
export async function listExceptions(companyId: string, runId: string) {
  return (await pageExceptions(companyId, runId)).items;
}

/* ---- Material requirements ---------------------------------------------------------- */

export type RequirementStatus = "critical" | "short" | "covered" | "adequate";

/**
 * One row per material and location planned: opening usable stock, total
 * gross requirement, scheduled receipts and planned receipts over the
 * horizon, the net requirement, and cover.
 *
 * Net requirement over the horizon = max(0, gross + safety stock − opening −
 * scheduled receipts): what must be newly supplied. Cover is the number of
 * days until stock without new orders falls below safety stock (the full
 * horizon when it never does). Status:
 *   critical — an unresolved CRITICAL or HIGH exception for the material there
 *   short    — needs new supply (planned orders), in time
 *   covered  — enough stock and open supply for the horizon
 */
export async function materialRequirements(companyId: string, runId: string) {
  const id = await resolveRunId(companyId, runId);
  const [run, rows, exceptions, policies] = await Promise.all([
    prisma.mrpRun.findUniqueOrThrow({ where: { id }, select: { asOfDate: true, horizonDays: true } }),
    prisma.mrpRequirement.findMany({
      where: { mrpRunId: id },
      orderBy: [{ materialId: "asc" }, { locationId: "asc" }, { bucketStart: "asc" }],
      include: {
        material: { select: { id: true, code: true, name: true, kind: true, category: { select: { name: true } }, unitOfMeasure: { select: { code: true } } } },
        location: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.mrpException.findMany({
      where: { mrpRunId: id, isResolved: false, severity: { in: ["CRITICAL", "HIGH"] } },
      select: { materialId: true, locationId: true },
    }),
    prisma.materialLocationPolicy.findMany({ where: { material: { companyId } }, select: { materialId: true, locationId: true, procurementType: true } }),
  ]);
  const asOf = isoDate(run.asOfDate);
  const flagged = new Set(exceptions.map((e) => `${e.materialId}|${e.locationId}`));
  const procurement = new Map(policies.map((p) => [`${p.materialId}|${p.locationId}`, p.procurementType]));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.materialId}|${r.locationId}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  return [...groups].map(([k, g]) => {
    const first = g[0];
    const n = (v: Prisma.Decimal) => v.toNumber();
    const opening = r6(n(first.projectedOnHand) - n(first.scheduledReceipts) + n(first.grossRequirement) - n(first.plannedReceipt));
    const gross = r6(g.reduce((s, r) => s + n(r.grossRequirement), 0));
    const scheduled = r6(g.reduce((s, r) => s + n(r.scheduledReceipts), 0));
    const plannedReceipts = r6(g.reduce((s, r) => s + n(r.plannedReceipt), 0));
    const safetyStock = n(first.safetyStock);
    const net = r6(Math.max(0, gross + safetyStock - opening - scheduled));

    // The first day new supply must be ordered (its planned release), if any.
    const firstRelease = g.find((r) => n(r.plannedRelease) > 0);
    let running = opening;
    let coverDays: number | null = null;
    for (const r of g) {
      running = r6(running + n(r.scheduledReceipts) - n(r.grossRequirement));
      if (running < safetyStock) { coverDays = Math.max(0, daysBetween(asOf, isoDate(r.bucketStart))); break; }
    }
    const status: RequirementStatus = flagged.has(k) ? "critical" : plannedReceipts > 0 ? "short" : gross > 0 || scheduled > 0 ? "covered" : "adequate";

    return {
      material: { id: first.material.id, code: first.material.code, name: first.material.name, kind: first.material.kind },
      category: first.material.category?.name ?? null,
      uom: first.material.unitOfMeasure.code,
      location: first.location,
      lowLevelCode: first.lowLevelCode,
      procurementType: procurement.get(k) ?? null,
      openingStock: opening, grossRequirement: gross, scheduledReceipts: scheduled, safetyStock,
      netRequirement: net, plannedReceipts,
      /** Days until stock without new orders drops below safety stock; null when it holds all horizon. */
      coverDays, horizonDays: run.horizonDays,
      /** ISO date of the earliest planned release (order-by date); null when nothing needs ordering. */
      nextPlannedRelease: firstRelease ? isoDate(firstRelease.bucketStart) : null,
      status,
    };
  }).sort((a, b) => a.lowLevelCode - b.lowLevelCode || a.material.code.localeCompare(b.material.code));
}

/** The time-phased record for one material at one location. */
export async function timePhased(companyId: string, runId: string, materialId: string, locationId: string) {
  const id = await resolveRunId(companyId, runId);
  const rows = await prisma.mrpRequirement.findMany({
    where: { mrpRunId: id, materialId, locationId },
    orderBy: { bucketStart: "asc" },
  });
  return rows.map((r) => ({
    bucketStart: isoDate(r.bucketStart), bucketEnd: isoDate(r.bucketEnd),
    grossRequirement: toNumber(r.grossRequirement), scheduledReceipts: toNumber(r.scheduledReceipts),
    projectedOnHand: toNumber(r.projectedOnHand), safetyStock: toNumber(r.safetyStock),
    netRequirement: toNumber(r.netRequirement), plannedReceipt: toNumber(r.plannedReceipt), plannedRelease: toNumber(r.plannedRelease),
  }));
}
