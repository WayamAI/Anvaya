import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { activeWhere } from "@/server/validation/material";
import type { ListCustomersQuery } from "@/server/validation/sales";

/** Customers by code, for pickers and the customer screen. */
export async function listCustomers(companyId: string, query: ListCustomersQuery) {
  const where: Prisma.CustomerWhereInput = {
    companyId,
    ...activeWhere(query.active),
    ...(query.q
      ? { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }
      : {}),
  };
  return prisma.customer.findMany({
    where,
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true, city: true, paymentTerms: true, isActive: true },
  });
}
