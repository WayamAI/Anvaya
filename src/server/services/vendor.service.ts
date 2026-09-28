import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { toNumber } from "@/server/api/decimal";
import { activeWhere } from "@/server/validation/material";
import type { ListVendorsQuery } from "@/server/validation/purchasing";

/**
 * Vendor list for pickers and the vendor screen. With `materialId`, only
 * vendors on file for that material, each with its price and lead time, and
 * the preferred vendor first: what a PO form needs to pre-fill a line.
 */
export async function listVendors(companyId: string, query: ListVendorsQuery) {
  const where: Prisma.VendorWhereInput = {
    companyId,
    ...activeWhere(query.active),
    ...(query.q
      ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }
      : {}),
    ...(query.materialId ? { materials: { some: { materialId: query.materialId, isActive: true } } } : {}),
  };

  const vendors = await prisma.vendor.findMany({
    where,
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, name: true, city: true, paymentTerms: true, isApproved: true, isActive: true,
      materials: {
        where: { materialId: query.materialId ?? "__none__", isActive: true },
        select: { unitPrice: true, leadTimeDays: true, isPreferred: true, minOrderQty: true },
      },
    },
  });

  const rows = vendors.map(({ materials, ...v }) => {
    const vm = materials[0];
    return {
      ...v,
      supply: vm
        ? { unitPrice: toNumber(vm.unitPrice), leadTimeDays: vm.leadTimeDays, isPreferred: vm.isPreferred, minOrderQty: toNumber(vm.minOrderQty) }
        : null,
    };
  });
  if (query.materialId) rows.sort((a, b) => Number(b.supply?.isPreferred ?? false) - Number(a.supply?.isPreferred ?? false));
  return rows;
}
