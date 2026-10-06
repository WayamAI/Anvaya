import { z } from "zod";
import { cursorPage } from "@/server/api/pagination";
import { id, isoDate } from "./common";

/** POST /api/v1/mrp/runs */
export const startRunBody = z.object({
  /**
   * The planning "today". A planning run always plans from today (omit it,
   * or send today); any other date needs `simulation: true`.
   */
  asOfDate: isoDate.optional(),
  /** A what-if from another date: stored, never latest, never convertible. */
  simulation: z.boolean().default(false),
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
  /** Material code or name. */
  q: z.string().trim().max(100).optional().transform((v) => (v ? v : undefined)),
  ...cursorPage(100, 500),
});

/** GET /api/v1/mrp/runs/:id/exceptions */
export const exceptionsQuery = z.object(cursorPage(100, 500));

/** GET /api/v1/mrp/runs */
export const runsQuery = z.object(cursorPage(25, 100));

export type PlannedOrdersQuery = z.infer<typeof plannedOrdersQuery>;

/** GET /api/v1/mrp/runs/:id/requirements */
export const requirementsQuery = z.object({
  materialId: id,
  locationId: id,
});
