import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { resolveSession } from "@/server/auth/session";
import { AppError } from "@/server/errors/app-error";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { login } from "./auth.service";

/**
 * Signing in when companies share a database: the same address in two
 * companies is two accounts, and the company named at sign-in decides which.
 */

let a: Fixture;
let b: Fixture;
const EMAIL = `same-person-${Date.now()}@shared.example`;
const PASSWORD_A = "Correct-Horse-A-1";
const PASSWORD_B = "Correct-Horse-B-2";
const code = (f: Fixture) => `IT-${f.tag}`;

async function refusal(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the sign-in to be refused");
}

async function user(f: Fixture, password: string) {
  return prisma.user.create({ data: { companyId: f.companyId, email: EMAIL, name: "Same Person", passwordHash: await hashPassword(password) } });
}

let userA: Awaited<ReturnType<typeof user>>;
let userB: Awaited<ReturnType<typeof user>>;

beforeAll(async () => {
  a = await createFixture();
  b = await createFixture();
  userA = await user(a, PASSWORD_A);
  userB = await user(b, PASSWORD_B);
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: [userA?.id, userB?.id].filter(Boolean) } } });
  await a?.destroy();
  await b?.destroy();
  await prisma.$disconnect();
});

describe("one email in two companies", () => {
  it("signs in to the company named, as that company's user", async () => {
    const inA = await login({ company: code(a), email: EMAIL, password: PASSWORD_A });
    expect(inA.actor).toMatchObject({ userId: userA.id, companyId: a.companyId });
    const inB = await login({ company: code(b), email: EMAIL, password: PASSWORD_B });
    expect(inB.actor).toMatchObject({ userId: userB.id, companyId: b.companyId });

    // The session belongs to that company alone.
    expect((await resolveSession(inB.token))!.companyId).toBe(b.companyId);
  });

  it("refuses one company's password at the other company, with the generic message", async () => {
    const e = await refusal(login({ company: code(b), email: EMAIL, password: PASSWORD_A }));
    expect(e.status).toBe(401);
    expect(e.message).toBe("Incorrect company, email or password");
    // Counted against B's account only; A is untouched.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).failedLoginCount).toBe(0);
    await prisma.user.update({ where: { id: userB.id }, data: { failedLoginCount: 0 } });
  });

  it("refuses an unknown or inactive company exactly like a wrong password", async () => {
    expect((await refusal(login({ company: "NO-SUCH-CO", email: EMAIL, password: PASSWORD_A }))).message).toBe("Incorrect company, email or password");
    await prisma.company.update({ where: { id: a.companyId }, data: { isActive: false } });
    try {
      expect((await refusal(login({ company: code(a), email: EMAIL, password: PASSWORD_A }))).status).toBe(401);
    } finally {
      await prisma.company.update({ where: { id: a.companyId }, data: { isActive: true } });
    }
  });
});

describe("failed sign-ins", () => {
  it("are all counted when they arrive at once, and lock the account", async () => {
    await Promise.all(Array.from({ length: 6 }, () => refusal(login({ company: code(a), email: EMAIL, password: "wrong-guess" }))));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(after.failedLoginCount).toBe(6);
    expect(after.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Locked even for the right password, until the lock expires.
    expect((await refusal(login({ company: code(a), email: EMAIL, password: PASSWORD_A }))).status).toBe(401);
  });
});
