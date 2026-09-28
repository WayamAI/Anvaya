import { z } from "zod";
import { MaterialKind, QcStatus } from "@prisma/client";

/** GET /api/v1/inventory/lots */
export const listLotsQuery = z.object({
  /**
   * Matches lot number, supplier lot, material code or name, location name
   * or vendor name, case-insensitively.
   */
  q: z.string().trim().max(100).optional(),
  qcStatus: z.nativeEnum(QcStatus).optional(),
  kind: z.nativeEnum(MaterialKind).optional(),
  locationId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().min(1).optional(),
});

export type ListLotsQuery = z.infer<typeof listLotsQuery>;

/** Route parameter for GRN lookup: "GRN-2026-0312". */
export const grnNumberParam = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GRN-[A-Z0-9-]+$/, "must look like GRN-2026-0312");
