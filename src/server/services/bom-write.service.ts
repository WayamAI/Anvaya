import { AuditAction, Prisma } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { companyContext, dateOnly, isoDate } from "@/server/config/business-date";
import { lockRow, runInTransaction } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { findCycle } from "@/server/production/bom-rules";
import type { CreateBomInput, CreateBomVersionInput } from "@/server/validation/bom";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Bills of material — write side: create a BOM, add versions, activate a
 * version, delete an unused draft version. Versions never change once
 * created; see `bom-rules.ts`.
 */

export async function createBom(input: CreateBomInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "bom:create");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    const material = await tx.material.findFirst({ where: { id: input.materialId, companyId }, select: { id: true, code: true, kind: true, isActive: true } });
    if (!material) throw AppError.unprocessable("The product does not exist", [{ path: "materialId", message: "not found" }]);
    if (!material.isActive) throw AppError.unprocessable(`${material.code} is inactive`);
    if (material.kind === "RAW" || material.kind === "PACKAGING") {
      throw AppError.unprocessable(`${material.code} is a ${material.kind.toLowerCase()} material; only made items have a BOM`, [{ path: "materialId", message: "not a made item" }]);
    }
    if (await tx.bom.findFirst({ where: { companyId, materialId: input.materialId }, select: { id: true } })) {
      throw AppError.conflict(`${material.code} already has a BOM; add a version to it instead`);
    }
    if (await tx.bom.findFirst({ where: { companyId, code: input.code }, select: { id: true } })) {
      throw AppError.conflict(`The BOM code ${input.code} is already in use`);
    }
    const bom = await tx.bom.create({
      data: { companyId, materialId: input.materialId, code: input.code, name: input.name, description: input.description ?? null },
      select: { id: true, code: true },
    });
    await recordAudit({ ...auditMeta(ctx), tx, action: AuditAction.CREATE, entityType: "boms", entityId: bom.id, entityLabel: bom.code, newValues: input });
    return bom;
  });
}

export async function createBomVersion(bomId: string, input: CreateBomVersionInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "bom:update");
  const companyId = ctx.actor.companyId;
  return runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "boms", bomId, companyId))) throw AppError.notFound("BOM", bomId);
    const bom = await tx.bom.findUniqueOrThrow({ where: { id: bomId }, select: { id: true, code: true, materialId: true } });
    if (await tx.bomVersion.findFirst({ where: { bomId, version: input.version }, select: { id: true } })) {
      throw AppError.conflict(`${bom.code} already has a version ${input.version}`);
    }

    const ids = input.components.map((c) => c.materialId);
    const materials = await tx.material.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, code: true, isActive: true, unitOfMeasureId: true, unitOfMeasure: { select: { dimension: true } } },
    });
    const units = await tx.unitOfMeasure.findMany({ where: { companyId }, select: { id: true, code: true, dimension: true } });
    const mById = new Map(materials.map((m) => [m.id, m]));
    const uById = new Map(units.map((u) => [u.id, u]));
    const problems: ErrorDetail[] = [];

    const components = input.components.map((c, i) => {
      const m = mById.get(c.materialId);
      if (!m) { problems.push({ path: `components.${i}.materialId`, message: "not found" }); return null; }
      if (!m.isActive) problems.push({ path: `components.${i}.materialId`, message: `${m.code} is inactive` });
      if (m.id === bom.materialId) problems.push({ path: `components.${i}.materialId`, message: "a product cannot be its own component" });
      const unitId = c.unitOfMeasureId ?? m.unitOfMeasureId;
      const unit = uById.get(unitId);
      if (!unit) problems.push({ path: `components.${i}.unitOfMeasureId`, message: "not found" });
      else if (unit.dimension !== m.unitOfMeasure.dimension) {
        problems.push({ path: `components.${i}.unitOfMeasureId`, message: `${unit.code} is ${unit.dimension}; ${m.code} is stocked by ${m.unitOfMeasure.dimension}` });
      }
      return {
        materialId: m.id, position: c.position ?? (i + 1) * 10, quantity: new Prisma.Decimal(c.quantity), unitOfMeasureId: unitId,
        scrapFactor: new Prisma.Decimal(c.scrapFactor ?? 0), leadTimeOffsetDays: c.leadTimeOffsetDays ?? 0, isOptional: c.isOptional ?? false,
      };
    });
    if (problems.length) throw AppError.unprocessable("The version cannot be created", problems);

    const version = await tx.bomVersion.create({
      data: {
        bomId, version: input.version, baseQuantity: new Prisma.Decimal(input.baseQuantity), isActive: false,
        effectiveFrom: dateOnly(input.effectiveFrom),
        components: { create: components.filter((c): c is NonNullable<typeof c> => c !== null) },
      },
      select: { id: true, version: true },
    });
    await recordAudit({
      ...auditMeta(ctx), tx, action: AuditAction.CREATE, entityType: "bom_versions", entityId: version.id,
      entityLabel: `${bom.code} rev ${version.version}`, newValues: input,
    });
    return version;
  });
}

export async function activateBomVersion(bomId: string, versionId: string, ctx: WriteContext) {
  requirePermission(ctx.actor, "bom:update");
  const companyId = ctx.actor.companyId;
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "boms", bomId, companyId))) throw AppError.notFound("BOM", bomId);
    const bom = await tx.bom.findUniqueOrThrow({ where: { id: bomId }, include: { material: { select: { code: true } } } });
    const version = await tx.bomVersion.findFirst({ where: { id: versionId, bomId }, include: { components: { select: { materialId: true, isOptional: true } } } });
    if (!version) throw AppError.notFound("BOM version", versionId);
    if (version.isActive) throw AppError.conflict(`${bom.code} rev ${version.version} is already active`);

    // Every active recipe in the company, to walk for cycles.
    const active = await tx.bomVersion.findMany({
      where: { isActive: true, bom: { companyId } },
      select: { bom: { select: { materialId: true } }, components: { select: { materialId: true } } },
    });
    const graph = new Map(active.map((v) => [v.bom.materialId, v.components.map((c) => c.materialId)]));
    const cycle = findCycle(bom.materialId, version.components.map((c) => c.materialId), graph);
    if (cycle) {
      const codes = await tx.material.findMany({ where: { id: { in: cycle } }, select: { id: true, code: true } });
      const code = new Map(codes.map((c) => [c.id, c.code]));
      throw AppError.unprocessable(`Activating this version would make ${bom.material.code} a component of itself: ${cycle.map((id) => code.get(id)).join(" → ")}`);
    }

    const { today } = await companyContext(companyId, tx);
    const previous = await tx.bomVersion.findFirst({ where: { bomId, isActive: true }, select: { id: true, version: true } });
    if (previous) await tx.bomVersion.update({ where: { id: previous.id }, data: { isActive: false, effectiveTo: dateOnly(today) } });
    await tx.bomVersion.update({ where: { id: versionId }, data: { isActive: true, effectiveTo: null } });

    await recordAudit({
      ...auditMeta(ctx), tx, action: AuditAction.APPROVE, entityType: "bom_versions", entityId: versionId,
      entityLabel: `${bom.code} rev ${version.version}`,
      previousValues: { activeVersion: previous?.version ?? null }, newValues: { activeVersion: version.version, effectiveFrom: isoDate(version.effectiveFrom) },
    });
  });
}

export async function deleteBomVersion(bomId: string, versionId: string, ctx: WriteContext) {
  requirePermission(ctx.actor, "bom:delete");
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "boms", bomId, ctx.actor.companyId))) throw AppError.notFound("BOM", bomId);
    const version = await tx.bomVersion.findFirst({ where: { id: versionId, bomId }, include: { bom: { select: { code: true } }, _count: { select: { workOrders: true } } } });
    if (!version) throw AppError.notFound("BOM version", versionId);
    if (version.isActive) throw AppError.conflict("The active version cannot be deleted; activate another first");
    if (version._count.workOrders) throw AppError.conflict(`Rev ${version.version} is pinned by ${version._count.workOrders} work order(s); it is history and stays`);
    await tx.bomVersion.delete({ where: { id: versionId } });
    await recordAudit({
      ...auditMeta(ctx), tx, action: AuditAction.DELETE, entityType: "bom_versions", entityId: versionId,
      entityLabel: `${version.bom.code} rev ${version.version}`,
    });
  });
}
