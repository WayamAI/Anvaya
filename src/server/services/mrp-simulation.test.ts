import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/server/errors/app-error";

/**
 * Simulation runs never stand in for the plan: "latest" and conversion only
 * ever mean the newest completed planning run. The run table is a fake that
 * applies the filters and ordering Postgres would.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

type Run = { id: string; companyId: string; runNumber: string; status: string; isSimulation: boolean; completedAt: Date };

const fake = vi.hoisted(() => {
  const runs: Run[] = [];
  function findFirst({ where = {}, orderBy }: { where?: Record<string, unknown>; orderBy?: { completedAt: "desc" } } = {}) {
    const hit = runs
      .filter((r) => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      .sort((a, b) => (orderBy ? b.completedAt.getTime() - a.completedAt.getTime() : 0));
    return Promise.resolve(hit[0] ?? null);
  }
  const db = { mrpRun: { findFirst }, $queryRaw: async () => [] };
  return { runs, db };
});
const runs = fake.runs;
vi.mock("@/server/db/client", () => ({ prisma: { ...fake.db, $transaction: (fn: (tx: unknown) => unknown) => fn(fake.db) } }));

import { resolveRunId } from "./mrp-read.service";
import { convertPlannedOrders } from "./mrp-convert.service";

const actor = { userId: "u1", companyId: "c1", email: "p@x", name: "P", sessionId: "s", roles: [], permissions: new Set(["mrp:run", "purchase-order:create", "work-order:create"]) };
const ctx = { actor, requestId: "r", clientInfo: { ipAddress: null, userAgent: null } };

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

beforeEach(() => {
  runs.length = 0;
  runs.push(
    { id: "plan", companyId: "c1", runNumber: "MRP-2026-0001", status: "COMPLETED", isSimulation: false, completedAt: new Date("2026-10-01T08:00:00Z") },
    // Newer, but a what-if from another date.
    { id: "sim", companyId: "c1", runNumber: "MRP-2026-0002", status: "COMPLETED", isSimulation: true, completedAt: new Date("2026-10-01T09:00:00Z") },
  );
});

describe("simulation runs", () => {
  it("are never the latest plan", async () => {
    expect(await resolveRunId("c1", "latest")).toBe("plan");
  });

  it("cannot be converted into orders", async () => {
    const e = await failure(convertPlannedOrders("sim", ["po-1"], ctx));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/simulation/);
  });

  it("do not supersede the planning run they follow", async () => {
    // Gets past the "latest run" check to the planned-order lookup, which the
    // fake answers with nothing.
    const e = await failure(convertPlannedOrders("plan", ["po-1"], ctx));
    expect(e.message).toMatch(/not part of this run/);
  });
});
