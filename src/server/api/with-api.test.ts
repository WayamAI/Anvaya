import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: vi.fn().mockResolvedValue(null), touchSession: vi.fn() }));

import { withApi } from "./with-api";

describe("withApi error mapping", () => {
  it("answers a value too large for its column with 422, not 500", async () => {
    const handler = withApi(async () => {
      throw new Prisma.PrismaClientKnownRequestError("Value out of range for the type: numeric field overflow", { code: "P2020", clientVersion: "7" });
    }, { auth: false });
    const res = await handler(new NextRequest("http://localhost:8080/api/v1/x"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: "VALIDATION_FAILED", message: "A value is too large to record" });
    expect(JSON.stringify(body)).not.toContain("numeric field overflow");
  });
});
