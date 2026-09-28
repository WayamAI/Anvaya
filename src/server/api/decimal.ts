import { Prisma } from "@prisma/client";

/**
 * Decimal → JSON.
 *
 * Prisma returns Decimal columns as Decimal.js instances, which serialise to
 * strings. Left alone, every quantity reaches the client as "4200.000000" and
 * each screen has to remember to parse it. Responses convert once, here, at
 * the edge.
 *
 * Arithmetic stays in Decimal until this point — sums across locations are
 * done before conversion, so no float error is introduced mid-calculation.
 * At the magnitudes a planning screen shows (quantities to six places, values
 * to four), a JS number round-trips the stored value exactly enough to display.
 */

export type DecimalLike = Prisma.Decimal | number | string;

export function toNumber(value: DecimalLike): number;
export function toNumber(value: DecimalLike | null | undefined): number | null;
export function toNumber(value: DecimalLike | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  return new Prisma.Decimal(value).toNumber();
}

/** Sum Decimal values without passing through floating point. */
export function sumDecimals(values: Iterable<DecimalLike | null | undefined>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const v of values) {
    if (v !== null && v !== undefined) total = total.plus(v);
  }
  return total;
}
