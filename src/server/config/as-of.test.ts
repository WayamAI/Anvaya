import { describe, it, expect, vi } from "vitest";
import { AS_OF_DATE } from "../../../prisma/seed/operational-data";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

describe("planning as-of date", () => {
  it("names the day the seeded demo data is arranged around", async () => {
    const { SEED_AS_OF_DATE } = await import("./as-of");
    expect(SEED_AS_OF_DATE).toBe(AS_OF_DATE);
  });

  it("is the real clock unless PLANNING_AS_OF_DATE pins it", async () => {
    vi.resetModules();
    vi.stubEnv("PLANNING_AS_OF_DATE", "");
    const live = await import("./as-of");
    const now = new Date("2026-09-28T10:00:00Z");
    expect(live.planningAsOf(now)).toBe(now);

    vi.resetModules();
    vi.stubEnv("PLANNING_AS_OF_DATE", "2026-03-25");
    const pinned = await import("./as-of");
    expect(pinned.planningAsOf(now).toISOString()).toBe("2026-03-25T00:00:00.000Z");
    vi.unstubAllEnvs();
  });
});
