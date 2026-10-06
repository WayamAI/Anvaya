import { env } from "@/server/config/env";

/**
 * The planning "today" that read screens measure overdue and "this week"
 * against.
 *
 * It is the real clock. The demo seed rebases its data onto the day it runs,
 * so the real clock suits it too. PLANNING_AS_OF_DATE pins it, outside
 * production only, to reproduce a demo seeded for a fixed day
 * (SEED_AS_OF_DATE) — then writes, which always use the real date, no longer
 * line up with the plan, so leave it unset for a live demo.
 *
 * Writes never use this: a receipt or dispatch is always dated in the
 * company's real time zone (see business-date.ts).
 */

/** The date the seed data is written for (before rebasing); kept equal to the seed by a test. */
export const SEED_AS_OF_DATE = "2026-03-25";

export function planningAsOf(now = new Date()): Date {
  return env.PLANNING_AS_OF_DATE ? new Date(`${env.PLANNING_AS_OF_DATE}T00:00:00Z`) : now;
}
