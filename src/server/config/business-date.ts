import { prisma } from "@/server/db/client";
import type { Tx } from "@/server/db/transaction";

/**
 * Dates for the write side.
 *
 * Reads that describe the seeded demo anchor to the planning as-of date
 * (`as-of.ts`). Writes never do: a receipt, dispatch or order placed today
 * is dated today, in the company's own time zone — a receipt booked at
 * 00:30 in Pune belongs to Pune's date, not to UTC's previous day.
 *
 * Business dates are `@db.Date` columns and travel as `YYYY-MM-DD`; they are
 * stored as UTC midnight of that calendar day, the same convention the seed
 * and every read service use.
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A YYYY-MM-DD business date as the Date Prisma stores in a `@db.Date` column. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = dateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** The company's time zone and currency, needed by most writes. */
export async function companyContext(companyId: string, tx?: Tx) {
  const company = await (tx ?? prisma).company.findUniqueOrThrow({
    where: { id: companyId },
    select: { timezone: true, currencyCode: true },
  });
  return { ...company, today: todayIn(company.timezone) };
}
