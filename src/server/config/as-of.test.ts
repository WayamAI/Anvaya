import { describe, it, expect } from "vitest";
import { PLANNING_AS_OF_DATE, planningAsOf } from "./as-of";
import { AS_OF_DATE } from "../../../prisma/seed/operational-data";

describe("planning as-of date", () => {
  it("is the day the seeded demo data is arranged around", () => {
    expect(PLANNING_AS_OF_DATE).toBe(AS_OF_DATE);
  });

  it("is the start of that day in UTC", () => {
    expect(planningAsOf().toISOString()).toBe("2026-03-25T00:00:00.000Z");
  });
});
