import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Route-level tests for MRP: permissions and body validation. Services are mocked. */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const session = vi.hoisted(() => ({ resolveSession: vi.fn() }));
const read = vi.hoisted(() => ({
  listRuns: vi.fn(), getRun: vi.fn(), listPlannedOrders: vi.fn(), listExceptions: vi.fn(),
  materialRequirements: vi.fn(), timePhased: vi.fn(), getPlannedOrder: vi.fn(),
}));
const write = vi.hoisted(() => ({ startMrpRun: vi.fn(), resolveException: vi.fn() }));
const convert = vi.hoisted(() => ({ convertPlannedOrders: vi.fn() }));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: session.resolveSession, touchSession: vi.fn() }));
vi.mock("@/server/services/mrp-read.service", () => read);
vi.mock("@/server/services/mrp-run.service", () => write);
vi.mock("@/server/services/mrp-convert.service", () => convert);

import { GET as listRuns, POST as startRun } from "./mrp/runs/route";
import { GET as getRun } from "./mrp/runs/[id]/route";
import { GET as plannedOrders } from "./mrp/runs/[id]/planned-orders/route";
import { GET as exceptions } from "./mrp/runs/[id]/exceptions/route";
import { GET as materials } from "./mrp/runs/[id]/materials/route";
import { GET as requirements } from "./mrp/runs/[id]/requirements/route";
import { POST as convertRoute } from "./mrp/runs/[id]/convert/route";
import { GET as plannedOrder } from "./mrp/planned-orders/[id]/route";
import { POST as resolve } from "./mrp/exceptions/[id]/resolve/route";

const actor = (permissions: string[]) => ({
  userId: "u1", companyId: "c1", email: "p@anvaya.in", name: "P", sessionId: "s1", roles: [], permissions: new Set(permissions),
});
const req = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost:8080/api/v1${path}`, {
    method, headers: { cookie: "anvaya.session=t", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
const p = { params: { id: "latest" } };

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(read).forEach((fn) => fn.mockResolvedValue([]));
  write.startMrpRun.mockResolvedValue({ id: "r1", runNumber: "MRP-2026-0001" });
  read.getRun.mockResolvedValue({ id: "r1" });
  convert.convertPlannedOrders.mockResolvedValue({ purchaseOrders: [], workOrders: [] });
});

describe("permissions", () => {
  const cases = [
    ["GET runs", "mrp:read", () => listRuns(req("/mrp/runs"))],
    ["GET run", "mrp:read", () => getRun(req("/mrp/runs/latest"), p)],
    ["GET planned orders", "mrp:read", () => plannedOrders(req("/mrp/runs/latest/planned-orders"), p)],
    ["GET exceptions", "mrp:read", () => exceptions(req("/mrp/runs/latest/exceptions"), p)],
    ["GET materials", "mrp:read", () => materials(req("/mrp/runs/latest/materials"), p)],
    ["GET requirements", "mrp:read", () => requirements(req("/mrp/runs/latest/requirements?materialId=m&locationId=l"), p)],
    ["GET planned order", "mrp:read", () => plannedOrder(req("/mrp/planned-orders/x"), { params: { id: "x" } })],
    ["POST run", "mrp:run", () => startRun(req("/mrp/runs", "POST", {}))],
    ["POST convert", "mrp:run", () => convertRoute(req("/mrp/runs/r1/convert", "POST", { plannedOrderIds: ["a"] }), { params: { id: "r1" } })],
    ["POST resolve", "mrp:run", () => resolve(req("/mrp/exceptions/e/resolve", "POST"), { params: { id: "e" } })],
  ] as const;

  it.each(cases)("%s needs %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor(["material:read"]));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain(permission);
  });

  it.each(cases)("%s succeeds with %s", async (_n, permission, call) => {
    session.resolveSession.mockResolvedValue(actor([permission]));
    expect((await call()).status).toBeLessThan(300);
  });
});

describe("validation", () => {
  beforeEach(() => session.resolveSession.mockResolvedValue(actor(["mrp:run", "mrp:read"])));

  it("applies defaults and bounds to run parameters", async () => {
    await startRun(req("/mrp/runs", "POST", {}));
    expect(write.startMrpRun.mock.calls[0][0]).toEqual({ horizonDays: 90, bucketSizeDays: 1, includeForecast: true, respectSafetyStock: true });
    for (const bad of [{ horizonDays: 3 }, { horizonDays: 400 }, { bucketSizeDays: 3 }, { asOfDate: "2026-02-30" }, { extra: 1 }]) {
      expect((await startRun(req("/mrp/runs", "POST", bad))).status).toBe(422);
    }
  });

  it("requires distinct planned orders to convert", async () => {
    expect((await convertRoute(req("/mrp/runs/r1/convert", "POST", { plannedOrderIds: [] }), { params: { id: "r1" } })).status).toBe(422);
    expect((await convertRoute(req("/mrp/runs/r1/convert", "POST", { plannedOrderIds: ["a", "a"] }), { params: { id: "r1" } })).status).toBe(422);
  });

  it("requires material and location for a time-phased record", async () => {
    expect((await requirements(req("/mrp/runs/latest/requirements?materialId=m"), p)).status).toBe(422);
  });
});
