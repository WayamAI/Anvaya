import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { activeWhere, type ListLocationsQuery } from "@/server/validation/material";

/**
 * Plants first, then in the order they were set up — the order a planner
 * reads warehouse columns in, rather than alphabetical.
 */
export const locationOrder: Prisma.LocationOrderByWithRelationInput[] = [
  { isManufacturing: "desc" },
  { createdAt: "asc" },
  { code: "asc" },
];

export async function listLocations(companyId: string, query: ListLocationsQuery) {
  return prisma.location.findMany({
    where: { companyId, ...activeWhere(query.active) },
    select: {
      id: true, code: true, name: true, type: true,
      city: true, state: true, isManufacturing: true, isActive: true,
    },
    orderBy: locationOrder,
  });
}
