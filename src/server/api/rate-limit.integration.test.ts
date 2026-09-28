import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { consume } from "./rate-limit";

/** The Postgres-backed limiter: counting, concurrency, and window reset. */

const key = `test:${randomUUID()}`;

afterAll(async () => {
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "test:" } } });
  await prisma.$disconnect();
});

describe("rate limiting", () => {
  it("allows up to the limit, then refuses with a retry time", async () => {
    for (let i = 0; i < 3; i++) await consume(key, { max: 3, windowSeconds: 60 });
    try {
      await consume(key, { max: 3, windowSeconds: 60 });
      throw new Error("expected a refusal");
    } catch (e) {
      expect(AppError.is(e) && e.status).toBe(429);
      expect((e as AppError).context?.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("counts every request when many arrive at once", async () => {
    const k = `test:${randomUUID()}`;
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => consume(k, { max: 5, windowSeconds: 60 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
  });

  it("starts a fresh window once the old one has passed", async () => {
    const k = `test:${randomUUID()}`;
    await consume(k, { max: 1, windowSeconds: 60 });
    await prisma.rateLimitBucket.update({ where: { key: k }, data: { windowStart: new Date(Date.now() - 61_000) } });
    await expect(consume(k, { max: 1, windowSeconds: 60 })).resolves.toBeUndefined();
  });
});
