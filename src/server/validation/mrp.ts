import { z } from "zod";
import { id, isoDate } from "./common";

/** POST /api/v1/mrp/runs */
export const startRunBody = z.object({
  /** The planning "today". Omitted → the planning as-of date (real date in production). */
  asOfDate: isoDate.optional(),
  horizonDays: z.number().int().min(7).max(365).default(90),
  /** 1 = daily buckets, 7 = weekly. */
  bucketSizeDays: z.union([z.literal(1), z.literal(7)]).default(1),
  includeForecast: z.boolean().default(true),
  respectSafetyStock: z.boolean().default(true),
}).strict();

export type StartRunInput = z.infer<typeof startRunBody>;

/** POST /api/v1/mrp/runs/:id/convert */
export const convertBody = z.object({
  plannedOrderIds: z.array(id).min(1, "choose at least one planned order").max(500)
    .refine((ids) => new Set(ids).size === ids.length, "lists a planned order more than once"),
}).strict();

export type ConvertInput = z.infer<typeof convertBody>;

/** GET /api/v1/mrp/runs/:id/planned-orders */
export const plannedOrdersQuery = z.object({
  type: z.enum(["PURCHASE", "PRODUCTION"]).optional(),
  status: z.enum(["PLANNED", "FIRMED", "CONVERTED", "CANCELLED"]).optional(),
  materialId: id.optional(),
});

export type PlannedOrdersQuery = z.infer<typeof plannedOrdersQuery>;

/** GET /api/v1/mrp/runs/:id/requirements */
export const requirementsQuery = z.object({
  materialId: id,
  locationId: id,
});
