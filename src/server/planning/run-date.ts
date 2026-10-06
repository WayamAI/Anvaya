import { AppError } from "@/server/errors/app-error";

/**
 * Which date an MRP run plans from, and whether it is a simulation.
 *
 * A planning run is the plan: its orders can be converted into real POs and
 * work orders, so it always plans from today in the company's time zone and
 * a client cannot backdate or postdate it. Planning from any other date is a
 * simulation — kept, readable, never "latest" and never convertible.
 *
 * `pinned` is PLANNING_AS_OF_DATE, the seeded demo's date. It can only be set
 * outside production (env.ts refuses it there); when set, a planning run
 * defaults to it and also accepts the real today.
 */
export function resolveRunDate(opts: {
  requestedAsOf?: string;
  simulation: boolean;
  today: string;
  pinned?: string;
}): { asOf: string; isSimulation: boolean } {
  const planningToday = opts.pinned ?? opts.today;
  if (opts.simulation) return { asOf: opts.requestedAsOf ?? planningToday, isSimulation: true };

  const allowed = new Set([opts.today, planningToday]);
  if (opts.requestedAsOf && !allowed.has(opts.requestedAsOf)) {
    throw AppError.unprocessable(
      `A planning run plans from today (${planningToday}); to plan from ${opts.requestedAsOf}, run a simulation`,
      [{ path: "asOfDate", message: `must be ${planningToday} unless simulation is true` }],
    );
  }
  return { asOf: opts.requestedAsOf ?? planningToday, isSimulation: false };
}
