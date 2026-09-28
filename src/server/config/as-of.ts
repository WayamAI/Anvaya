import { env } from "@/server/config/env";

/**
 * The planning "today" that read screens measure overdue and "this week"
 * against.
 *
 * In production it is the real clock. For the seeded demo, whose open orders
 * are arranged around 2026-03-25, set PLANNING_AS_OF_DATE=2026-03-25 so the
 * screens read as the data intends; measured against the real clock every
 * demo order would look months overdue.
 *
 * Writes never use this: a receipt or dispatch is always dated in the
 * company's real time zone (see business-date.ts).
 */

/** The date the seeded demo data is arranged around; kept equal to the seed by a test. */
export const SEED_AS_OF_DATE = "2026-03-25";

export function planningAsOf(now = new Date()): Date {
  return env.PLANNING_AS_OF_DATE ? new Date(`${env.PLANNING_AS_OF_DATE}T00:00:00Z`) : now;
}
