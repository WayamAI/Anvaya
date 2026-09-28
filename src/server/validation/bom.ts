import { z } from "zod";
import { id, isoDate, optionalText, qty, text } from "./common";

/** POST /api/v1/boms */
export const createBomBody = z.object({
  materialId: id,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/, "use up to 40 letters, digits, '.', '_' or '-'"),
  name: text(200).min(1),
  description: optionalText(2000),
}).strict();
export type CreateBomInput = z.infer<typeof createBomBody>;

/** POST /api/v1/boms/:id/versions — created inactive; activate separately. */
export const createBomVersionBody = z.object({
  version: text(20).min(1),
  /** The component quantities produce this much of the product. */
  baseQuantity: qty,
  effectiveFrom: isoDate,
  components: z.array(z.object({
    materialId: id,
    quantity: qty,
    /** Omitted → the material's stocking unit. Must be the same dimension. */
    unitOfMeasureId: id.optional(),
    /** Expected loss as a fraction, 0 ≤ scrap < 1. */
    scrapFactor: z.number().min(0).lt(1).optional(),
    leadTimeOffsetDays: z.number().int().min(0).max(365).optional(),
    isOptional: z.boolean().optional(),
    position: z.number().int().min(0).max(100_000).optional(),
  })).min(1, "a version needs at least one component").max(300),
}).strict();
export type CreateBomVersionInput = z.infer<typeof createBomVersionBody>;
