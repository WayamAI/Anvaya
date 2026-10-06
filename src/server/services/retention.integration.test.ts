import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { RETENTION, purgeExpiredRecords } from "./retention.service";

/**
 * Housekeeping cut-offs against Postgres, with a fixed "now" so every row's
 * age is exact. Only this test's own rows are asserted on.
 */

const NOW = new Date("2026-10-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

let f: Fixture;
let userId: string;
const sessions: Record<string, string> = {};
const keys: Record<string, string> = {};

beforeAll(async () => {
  f = await createFixture();
  userId = (await f.actor([], "Retention")).userId;
  const session = async (name: string, data: { expiresAt: Date; revokedAt?: Date | null; createdAt?: Date }) => {
    sessions[name] = (await prisma.session.create({ data: { userId, tokenHash: `${f.tag}-${name}`, ...data } })).id;
  };
  await session("active", { expiresAt: inDays(1) });
  await session("activeOldLogin", { expiresAt: inDays(1), createdAt: daysAgo(90) }); // long-lived, still valid
  await session("expiredRecently", { expiresAt: daysAgo(29) });
  await session("expiredLongAgo", { expiresAt: daysAgo(31) });
  await session("revokedRecently", { expiresAt: inDays(1), revokedAt: daysAgo(5) });
  await session("revokedLongAgo", { expiresAt: inDays(1), revokedAt: daysAgo(31) });

  const key = async (name: string, createdAt: Date) => {
    keys[name] = (await prisma.idempotencyKey.create({
      data: { companyId: f.companyId, userId, key: `${f.tag}-${name}`, scope: "test", requestHash: "h", responseStatus: 201, responseBody: {}, createdAt },
    })).id;
  };
  await key("fresh", daysAgo(0));
  await key("withinWindow", daysAgo(6));
  await key("pastWindow", daysAgo(8));
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId } });
  await f?.destroy();
  await prisma.$disconnect();
});

describe("purgeExpiredRecords", () => {
  it("keeps every active session, and ended ones for 30 days", async () => {
    expect(RETENTION).toMatchObject({ endedSessionDays: 30, idempotencyKeyDays: 7 });
    await purgeExpiredRecords(NOW);
    const left = new Set((await prisma.session.findMany({ where: { userId }, select: { id: true } })).map((s) => s.id));
    expect(Object.entries(sessions).filter(([, id]) => left.has(id)).map(([n]) => n).sort())
      .toEqual(["active", "activeOldLogin", "expiredRecently", "revokedRecently"]);
  });

  it("keeps idempotency keys for the replay window, then lets them go", async () => {
    const left = new Set((await prisma.idempotencyKey.findMany({ where: { companyId: f.companyId }, select: { id: true } })).map((k) => k.id));
    expect(Object.entries(keys).filter(([, id]) => left.has(id)).map(([n]) => n).sort()).toEqual(["fresh", "withinWindow"]);
  });

  it("is safe to run again: nothing more of ours goes", async () => {
    const before = await prisma.session.count({ where: { userId } }) + await prisma.idempotencyKey.count({ where: { companyId: f.companyId } });
    await purgeExpiredRecords(NOW);
    const after = await prisma.session.count({ where: { userId } }) + await prisma.idempotencyKey.count({ where: { companyId: f.companyId } });
    expect(after).toBe(before);
  });
});
