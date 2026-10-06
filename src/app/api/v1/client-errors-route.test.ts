import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/** Browser render errors, recorded through the server logger. */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const log = vi.hoisted(() => ({ error: vi.fn() }));
const limits = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: vi.fn().mockResolvedValue(null), touchSession: vi.fn() }));
vi.mock("@/server/api/rate-limit", () => ({ consume: limits.consume, LIMITS: {} }));
vi.mock("@/server/logger", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: log.error, debug: vi.fn(), child: () => logger };
  return { logger };
});

import { POST } from "./client-errors/route";

const post = (body: unknown) => POST(new NextRequest("http://localhost:8080/api/v1/client-errors", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/client-errors", () => {
  it("logs the report and answers 204, signed in or not", async () => {
    const res = await post({ message: "x is undefined", digest: "123", path: "/mrp-run", scope: "app", stack: "at MRPRun" });
    expect(res.status).toBe(204);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ clientError: expect.objectContaining({ message: "x is undefined", digest: "123", path: "/mrp-run", scope: "app" }) }),
      "client render error",
    );
  });

  it("is rate limited per address, so it cannot flood the log", async () => {
    await post({ message: "m", path: "/", scope: "root" });
    expect(limits.consume).toHaveBeenCalledWith(expect.stringMatching(/^client-error:ip:/), expect.objectContaining({ max: expect.any(Number) }));
  });

  it("refuses oversized or malformed reports", async () => {
    expect((await post({ message: "m".repeat(2001), path: "/", scope: "app" })).status).toBe(422);
    expect((await post({ message: "m", path: "https://evil.example/", scope: "app" })).status).toBe(422);
    expect((await post({ message: "m", path: "/", scope: "nope" })).status).toBe(422);
    expect(log.error).not.toHaveBeenCalled();
  });
});
