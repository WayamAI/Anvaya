import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/server/db/client";
import { verifyPassword } from "@/server/auth/password";
import { createSession, resolveSession } from "@/server/auth/session";
import { AppError } from "@/server/errors/app-error";
import { passwordSchema } from "@/server/validation/auth";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import {
  createRole, createUser, deleteRole, listRoles, resetUserPassword, temporaryPassword, updateRole, updateUser,
} from "./user-admin.service";

/**
 * Users and roles against Postgres: privilege escalation, the last
 * administrator, temporary passwords and session revocation.
 */

let f: Fixture;
let adminRole: { id: string };
let viewerRole: { id: string };
let admin: Awaited<ReturnType<Fixture["actor"]>>;
let userManager: Awaited<ReturnType<Fixture["actor"]>>;

const MANAGER_PERMS = ["user:read", "user:create", "user:update", "role:read", "role:create", "role:update", "role:delete", "material:read"];

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (AppError.is(e)) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  f = await createFixture();
  const all = await prisma.permission.findMany({ select: { id: true, code: true } });
  const byCode = new Map(all.map((p) => [p.code, p.id]));
  adminRole = await prisma.role.create({
    data: { companyId: f.companyId, code: "ADMIN", name: "Administrator", isSystem: true, permissions: { create: all.map((p) => ({ permissionId: p.id })) } },
  });
  viewerRole = await prisma.role.create({
    data: { companyId: f.companyId, code: "VIEWER", name: "Viewer", isSystem: true, permissions: { create: [{ permissionId: byCode.get("material:read")! }] } },
  });
  admin = await f.actor(all.map((p) => p.code), "Admin");
  await prisma.userRole.create({ data: { userId: admin.userId, roleId: adminRole.id } });
  userManager = await f.actor(MANAGER_PERMS, "UserManager");
});

afterAll(async () => {
  await prisma.role.deleteMany({ where: { companyId: f.companyId } }).catch(() => undefined);
  await f?.destroy();
  await prisma.$disconnect();
});

describe("temporary passwords", () => {
  it("always satisfy the password policy", () => {
    for (let i = 0; i < 50; i++) expect(passwordSchema.safeParse(temporaryPassword()).success).toBe(true);
  });
});

describe("users", () => {
  it("creates a user with a one-time temporary password they must replace", async () => {
    const r = await createUser({ email: "new.user@test.local", name: "New User", roleIds: [viewerRole.id] }, f.ctx(userManager));
    expect(r.temporaryPassword).toBeTruthy();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: r.user.id } });
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(r.temporaryPassword!, row.passwordHash)).toBe(true);

    // The session resolves, carrying the flag the API enforces.
    const s = await createSession(r.user.id);
    expect((await resolveSession(s.token))?.mustChangePassword).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: r.user.id, action: "CREATE" } });
    expect(JSON.stringify(audit.newValues)).not.toContain(r.temporaryPassword!);
  });

  it("refuses to grant a role carrying permissions the administrator lacks", async () => {
    const e = await failure(createUser({ email: "sneaky@test.local", name: "Sneaky", roleIds: [adminRole.id] }, f.ctx(userManager)));
    expect(e.status).toBe(403);
    expect(e.message).toMatch(/cannot grant permissions you do not hold/);
    expect(await prisma.user.count({ where: { companyId: f.companyId, email: "sneaky@test.local" } })).toBe(0);
  });

  it("refuses to demote, deactivate or reset someone more powerful", async () => {
    expect((await failure(updateUser(admin.userId, { isActive: false }, f.ctx(userManager)))).status).toBe(403);
    expect((await failure(resetUserPassword(admin.userId, {}, f.ctx(userManager)))).status).toBe(403);
  });

  it("keeps the last active administrator, and stops self-deactivation", async () => {
    expect((await failure(updateUser(admin.userId, { isActive: false }, f.ctx(admin)))).message).toMatch(/your own account/);
    const deputy = await f.actor([], "Deputy");
    await prisma.userRole.create({ data: { userId: deputy.userId, roleId: viewerRole.id } });
    const e = await failure(updateUser(admin.userId, { roleIds: [viewerRole.id] }, f.ctx({ ...admin, userId: deputy.userId })));
    expect(e.message).toMatch(/last active administrator/);

    // With a second administrator the first can step down.
    await updateUser(deputy.userId, { roleIds: [adminRole.id] }, f.ctx(admin));
    await updateUser(admin.userId, { roleIds: [adminRole.id, viewerRole.id] }, f.ctx({ ...admin, userId: deputy.userId }));
  });

  it("revokes every session on deactivation and on a password reset", async () => {
    const { user } = await createUser({ email: "leaver@test.local", name: "Leaver", roleIds: [viewerRole.id] }, f.ctx(userManager));
    const a = await createSession(user.id);
    await resetUserPassword(user.id, { password: "Brand-New-Passw0rd" }, f.ctx(userManager));
    expect(await resolveSession(a.token)).toBeNull();

    const b = await createSession(user.id);
    await updateUser(user.id, { isActive: false }, f.ctx(userManager));
    expect(await resolveSession(b.token)).toBeNull();
  });
});

describe("roles", () => {
  it("creates, edits and deletes custom roles within the creator's own powers", async () => {
    const role = await createRole({ code: "QC_LEAD", name: "QC lead", permissions: ["material:read"] }, f.ctx(userManager));
    expect((await failure(updateRole(role.id, { permissions: ["material:read", "inventory:adjust"] }, f.ctx(userManager)))).status).toBe(403);
    await updateRole(role.id, { name: "Quality lead" }, f.ctx(userManager));
    expect((await listRoles(f.companyId)).find((r) => r.id === role.id)).toMatchObject({ name: "Quality lead", permissions: ["material:read"], users: 0 });
    await deleteRole(role.id, f.ctx(userManager));
  });

  it("refuses unknown permissions, and protects system roles and roles in use", async () => {
    expect((await failure(createRole({ code: "X1", name: "X", permissions: ["material:fly"] }, f.ctx(admin)))).status).toBe(422);
    expect((await failure(updateRole(viewerRole.id, { name: "Renamed" }, f.ctx(admin)))).message).toMatch(/system role/);
    const role = await createRole({ code: "IN_USE", name: "In use", permissions: ["material:read"] }, f.ctx(admin));
    await createUser({ email: "holder@test.local", name: "Holder", roleIds: [role.id] }, f.ctx(admin));
    expect((await failure(deleteRole(role.id, f.ctx(admin)))).message).toMatch(/assigned to 1 user/);
  });
});
