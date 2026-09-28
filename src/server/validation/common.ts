import { z } from "zod";

/** Field primitives shared by every write body. */

export const id = z.string().trim().min(1).max(64);

/** A real calendar date as YYYY-MM-DD. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date as YYYY-MM-DD")
  // Round-trip, because Date.parse happily rolls 2026-02-30 over to 2 March.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "is not a real date");

/** Positive, at most 6 decimal places (the quantity columns' scale) and in range. */
export const qty = z.number().finite().positive("must be greater than 0").max(1e12)
  .refine((v) => Number(v.toFixed(6)) === v, "has more than 6 decimal places");

export const nonNegativeQty = z.number().finite().min(0).max(1e12)
  .refine((v) => Number(v.toFixed(6)) === v, "has more than 6 decimal places");

export const price = z.number().finite().min(0, "cannot be negative").max(1e12);

export const text = (max: number) => z.string().trim().max(max);

/** Trimmed; blank becomes undefined. */
export const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : undefined));

export const reason = z.string().trim().min(3, "give a reason of at least 3 characters").max(500);
