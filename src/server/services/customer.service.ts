import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { cursorArgs, pageOf } from "@/server/api/pagination";
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
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ code: "asc" }, { id: "asc" }],
      ...cursorArgs({ limit: query.limit ?? 50, cursor: query.cursor }),
      select: { id: true, code: true, name: true, type: true, city: true, state: true, country: true, contactPerson: true, contactEmail: true, contactPhone: true, paymentTerms: true, isActive: true },
    }),
    prisma.customer.count({ where }),
  ]);
  const page = pageOf(rows, query.limit ?? 50);
  return { items: page.items, nextCursor: page.nextCursor, total };
}
