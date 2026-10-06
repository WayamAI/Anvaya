import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** The public health probe: reports database trouble without revealing it. */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const db = vi.hoisted(() => ({ checkDatabase: vi.fn() }));
const log = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: {}, checkDatabase: db.checkDatabase }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: vi.fn().mockResolvedValue(null), touchSession: vi.fn() }));
vi.mock("@/server/logger", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: log.error, debug: vi.fn(), child: () => logger };
  return { logger };
});

import { GET } from "./health/route";

const req = () => new NextRequest("http://localhost:8080/api/v1/health");

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/health", () => {
  it("answers 200 without signing in when the database responds", async () => {
    db.checkDatabase.mockResolvedValue({ ok: true, latencyMs: 3 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: "ok", checks: { database: { ok: true } } });
  });

  it("answers a generic 503 when it cannot, keeping the driver's detail in the server log", async () => {
    const driverError = new Error('password authentication failed for user "anvaya_prod" at db-internal.acme.example:5432');
    db.checkDatabase.mockRejectedValue(driverError);

    const res = await GET(req());
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text).error).toMatchObject({ code: "UNAVAILABLE", message: "The service is unavailable" });
    for (const secret of ["password", "anvaya_prod", "db-internal", "5432"]) expect(text).not.toContain(secret);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: driverError }), expect.any(String));
  });
});
