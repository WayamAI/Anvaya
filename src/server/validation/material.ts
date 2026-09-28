import { z } from "zod";
import { MaterialKind } from "@prisma/client";

/** `?active=` on master-data lists: active rows by default, or all of them. */
const activeFilter = z.enum(["true", "false", "all"]).default("true");

/** GET /api/v1/materials */
export const listMaterialsQuery = z.object({
  /** Matches code or name, case-insensitively. */
  q: z.string().trim().max(100).optional(),
  kind: z.nativeEnum(MaterialKind).optional(),
  categoryId: z.string().min(1).optional(),
  active: activeFilter,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional(),
});

export type ListMaterialsQuery = z.infer<typeof listMaterialsQuery>;

/** GET /api/v1/locations */
export const listLocationsQuery = z.object({
  active: activeFilter,
});

export type ListLocationsQuery = z.infer<typeof listLocationsQuery>;

/** GET /api/v1/inventory/stock-overview */
export const stockOverviewQuery = z.object({
  /** Restrict to one location. Omitted means every active location. */
  locationId: z.string().min(1).optional(),
});

export type StockOverviewQuery = z.infer<typeof stockOverviewQuery>;

/** Maps the `active` filter onto a Prisma `isActive` condition. */
export function activeWhere(active: "true" | "false" | "all") {
  return active === "all" ? {} : { isActive: active === "true" };
}
