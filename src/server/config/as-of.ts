/**
 * The planning "today".
 *
 * The seeded demo data is arranged around 2026-03-25: open orders fall due
 * in the weeks after it and the delivered ones just before. Measured against
 * the real clock every open order would read as months overdue and every
 * "this week" figure as zero, so screens that opt in anchor here instead.
 * Kept equal to the seed's AS_OF_DATE by a test.
 */
export const PLANNING_AS_OF_DATE = "2026-03-25";

export function planningAsOf(): Date {
  return new Date(`${PLANNING_AS_OF_DATE}T00:00:00Z`);
}
