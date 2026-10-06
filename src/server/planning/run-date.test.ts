import { describe, it, expect } from "vitest";
import { AppError } from "@/server/errors/app-error";
import { resolveRunDate } from "./run-date";

const TODAY = "2026-10-01";

function refusal(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

describe("resolveRunDate — planning runs", () => {
  it("plans from the company's today by default", () => {
    expect(resolveRunDate({ simulation: false, today: TODAY })).toEqual({ asOf: TODAY, isSimulation: false });
  });

  it("accepts today stated explicitly", () => {
    expect(resolveRunDate({ requestedAsOf: TODAY, simulation: false, today: TODAY })).toEqual({ asOf: TODAY, isSimulation: false });
  });

  it("refuses any other date, past or future, and points at simulation", () => {
    for (const other of ["2026-03-25", "2026-10-02"]) {
      const e = refusal(() => resolveRunDate({ requestedAsOf: other, simulation: false, today: TODAY }));
      expect(e.status).toBe(422);
      expect(e.message).toMatch(/simulation/);
      expect(e.details?.[0].path).toBe("asOfDate");
    }
  });

  it("outside production, defaults to the pinned demo date and accepts it or the real today", () => {
    const pinned = "2026-03-25";
    expect(resolveRunDate({ simulation: false, today: TODAY, pinned })).toEqual({ asOf: pinned, isSimulation: false });
    expect(resolveRunDate({ requestedAsOf: TODAY, simulation: false, today: TODAY, pinned }).asOf).toBe(TODAY);
    expect(refusal(() => resolveRunDate({ requestedAsOf: "2026-01-01", simulation: false, today: TODAY, pinned })).status).toBe(422);
  });
});

describe("resolveRunDate — simulations", () => {
  it("plan from the date asked for and are marked as simulations", () => {
    expect(resolveRunDate({ requestedAsOf: "2026-03-25", simulation: true, today: TODAY })).toEqual({ asOf: "2026-03-25", isSimulation: true });
  });

  it("default to today but stay simulations", () => {
    expect(resolveRunDate({ simulation: true, today: TODAY })).toEqual({ asOf: TODAY, isSimulation: true });
  });
});
