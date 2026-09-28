import { z } from "zod";
import { id, nonNegativeQty, optionalText, price } from "./common";

/** POST /api/v1/inventory/adjustments */
export const ADJUSTMENT_REASONS = ["CYCLE_COUNT", "DAMAGE", "EXPIRY", "FOUND", "LOSS", "DATA_CORRECTION"] as const;

export const adjustmentBody = z.object({
  materialId: id,
  locationId: id,
  /** Required for batch-tracked materials: the count is per lot. */
  lotId: id.optional(),
  /** What was physically counted. The adjustment is counted − book. */
  countedQty: nonNegativeQty,
  reason: z.enum(ADJUSTMENT_REASONS),
  notes: optionalText(1000),
  /**
   * Value of found stock, per unit. Omitted → the balance's current average,
   * else the material's standard cost.
   */
  unitCost: price.optional(),
}).strict();

export type AdjustmentInput = z.infer<typeof adjustmentBody>;

/** GET /api/v1/inventory/adjustments */
export const listAdjustmentsQuery = z.object({
  materialId: id.optional(),
  locationId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuery>;
