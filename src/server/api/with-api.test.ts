import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/session", () => ({ SESSION_COOKIE: "anvaya.session", resolveSession: vi.fn().mockResolvedValue(null), touchSession: vi.fn() }));

import { z } from "zod";
import { MAX_BODY_BYTES, parseBody, withApi } from "./with-api";

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

describe("parseBody size cap", () => {
  const schema = z.object({ notes: z.string() });
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:8080/api/v1/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

  it("parses a body under the limit", async () => {
    await expect(parseBody(post(JSON.stringify({ notes: "ok" })), schema)).resolves.toEqual({ notes: "ok" });
  });

  it("answers 413 for a body over the limit, before parsing it", async () => {
    const handler = withApi(async (ctx) => {
      await parseBody(ctx.req, schema);
      throw new Error("unreachable");
    }, { auth: false });
    const res = await handler(post(JSON.stringify({ notes: "a".repeat(MAX_BODY_BYTES) })));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("refuses an oversized body even when content-length understates it", async () => {
    const big = new TextEncoder().encode(JSON.stringify({ notes: "a".repeat(MAX_BODY_BYTES) }));
    const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
    const req = new NextRequest("http://localhost:8080/api/v1/x", { method: "POST", body: stream, headers: { "content-length": "10" }, duplex: "half" } as RequestInit & { duplex: "half" });
    await expect(parseBody(req, schema)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("still reports malformed JSON as a validation error", async () => {
    await expect(parseBody(post("{nope"), schema)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
