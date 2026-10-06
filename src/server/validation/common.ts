import { z } from "zod";
import { cursorPage } from "@/server/api/pagination";

/** Field primitives shared by every write body. */

export const id = z.string().trim().min(1).max(64);

/** A real calendar date as YYYY-MM-DD. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date as YYYY-MM-DD")
  // Round-trip, because Date.parse happily rolls 2026-02-30 over to 2 March.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "is not a real date");

/*
 * Bounds that fit the columns, with room for the arithmetic done on them:
 * quantities are Decimal(18,6) (twelve integer digits) and money
 * Decimal(18,4). A value past them would otherwise reach Postgres and come
 * back as a 500. Line and order totals are checked by `amountProblems`.
 */
const LIMIT = 1e9;
const LIMIT_MESSAGE = "must be less than 1,000,000,000";

/** Positive, at most 6 decimal places (the quantity columns' scale) and in range. */
export const qty = z.number().finite().positive("must be greater than 0").lt(LIMIT, LIMIT_MESSAGE)
  .refine((v) => Number(v.toFixed(6)) === v, "has more than 6 decimal places");

export const nonNegativeQty = z.number().finite().min(0).lt(LIMIT, LIMIT_MESSAGE)
  .refine((v) => Number(v.toFixed(6)) === v, "has more than 6 decimal places");

/** A unit price: at most 4 decimal places, the money columns' scale. */
export const price = z.number().finite().min(0, "cannot be negative").lt(LIMIT, LIMIT_MESSAGE)
  .refine((v) => Number(v.toFixed(4)) === v, "has more than 4 decimal places");

export const text = (max: number) => z.string().trim().max(max);

/** Trimmed; blank becomes undefined. */
export const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : undefined));

export const reason = z.string().trim().min(3, "give a reason of at least 3 characters").max(500);

/**
 * GET of an order list: a status tab (or "overdue"), a search term, and a
 * cursor page — 50 by default, at most 200.
 */
export const listOrdersQuery = <S extends string>(statuses: readonly [S, ...S[]]) => z.object({
  status: z.enum([...statuses, "overdue"] as [S | "overdue", ...(S | "overdue")[]]).optional(),
  q: z.string().trim().max(100).optional().transform((v) => (v ? v : undefined)),
  ...cursorPage(50, 200),
});
