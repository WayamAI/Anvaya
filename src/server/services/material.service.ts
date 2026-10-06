import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { activeWhere, type ListMaterialsQuery } from "@/server/validation/material";

/**
 * Material master data — read side.
 *
 * Every query is scoped by companyId, taken from the session rather than the
 * request, so one tenant can never list or open another's materials. Lookups
 * by id filter on companyId in the same query, so a foreign id reads exactly
 * like a missing one.
 */

const materialInclude = {
  category: { select: { id: true, code: true, name: true } },
  unitOfMeasure: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MaterialInclude;

type MaterialWithRefs = Prisma.MaterialGetPayload<{ include: typeof materialInclude }>;

function toMaterialDto(m: MaterialWithRefs) {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    kind: m.kind,
    category: m.category,
    unit: m.unitOfMeasure,
    standardCost: toNumber(m.standardCost),
    shelfLifeDays: m.shelfLifeDays,
    isBatchTracked: m.isBatchTracked,
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export type MaterialDto = ReturnType<typeof toMaterialDto>;

export async function listMaterials(companyId: string, query: ListMaterialsQuery) {
  const where: Prisma.MaterialWhereInput = {
    companyId,
    ...activeWhere(query.active),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.kinds?.length ? { kind: { in: query.kinds } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: "insensitive" } },
            { name: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.material.findMany({
      where,
      include: materialInclude,
      // id breaks ties so the cursor position is unambiguous.
      orderBy: [{ code: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
    prisma.material.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    items: page.map(toMaterialDto),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  };
}

export async function getMaterial(companyId: string, id: string) {
  const m = await prisma.material.findFirst({
    where: { id, companyId },
    include: {
      ...materialInclude,
      policies: {
        include: { location: { select: { id: true, code: true, name: true } } },
        orderBy: { location: { code: "asc" } },
      },
      balances: {
        include: { location: { select: { id: true, code: true, name: true } } },
        orderBy: { location: { code: "asc" } },
      },
    },
  });

  if (!m) throw AppError.notFound("Material", id);

  return {
    ...toMaterialDto(m),
    policies: m.policies.map((p) => ({
      id: p.id,
      location: p.location,
      procurementType: p.procurementType,
      safetyStock: toNumber(p.safetyStock),
      reorderPoint: toNumber(p.reorderPoint),
      lotSizingRule: p.lotSizingRule,
      minOrderQty: toNumber(p.minOrderQty),
      maxOrderQty: toNumber(p.maxOrderQty),
      orderMultiple: toNumber(p.orderMultiple),
      periodDays: p.periodDays,
      productionLeadTimeDays: p.productionLeadTimeDays,
      safetyLeadTimeDays: p.safetyLeadTimeDays,
      averageDailyDemand: toNumber(p.averageDailyDemand),
      demandStdDev: toNumber(p.demandStdDev),
      serviceLevel: toNumber(p.serviceLevel),
      abcClass: p.abcClass,
      isActive: p.isActive,
    })),
    balances: m.balances.map((b) => ({
      location: b.location,
      onHandQty: toNumber(b.onHandQty),
      reservedQty: toNumber(b.reservedQty),
      quarantineQty: toNumber(b.quarantineQty),
      valuation: toNumber(b.valuation),
      lastMovementAt: b.lastMovementAt?.toISOString() ?? null,
    })),
  };
}

export async function listMaterialCategories(companyId: string) {
  return prisma.materialCategory.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true, parentId: true },
    orderBy: { code: "asc" },
  });
}

export async function listUnits(companyId: string) {
  return prisma.unitOfMeasure.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true, dimension: true },
    orderBy: { code: "asc" },
  });
}
