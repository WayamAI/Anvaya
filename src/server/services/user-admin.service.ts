import { randomBytes } from "node:crypto";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { requirePermission } from "@/server/auth/rbac";
import { lockRow, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";
import type {
  CreateRoleInput, CreateUserInput, ResetPasswordInput, UpdateRoleInput, UpdateUserInput,
} from "@/server/validation/admin";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Users and roles.
 *
 * Two rules guard against privilege escalation and lock-out:
 *
 * 1. You can only hand out what you hold. Assigning a role to a user, or
 *    composing a custom role, is refused if it carries any permission the
 *    acting administrator does not have — otherwise anyone with
 *    `role:update` could mint themselves an all-powerful role.
 * 2. The company always keeps an active administrator. The last active user
 *    holding the ADMIN role cannot be deactivated or lose that role, and no
 *    one can deactivate themselves.
 *
 * Deactivating a user or resetting their password revokes their sessions at
 * once. Role changes need no revocation: permissions are resolved from the
 * database on every request.
 */

const ADMIN_ROLE = "ADMIN";

/** A random password that satisfies the policy: long, mixed case, a digit. */
export function temporaryPassword(): string {
  return `Tmp-${randomBytes(12).toString("base64url")}a7Z`;
}

async function assertCanGrant(tx: Tx, ctx: WriteContext, roleIds: string[]) {
  const roles = await tx.role.findMany({
    where: { id: { in: roleIds }, companyId: ctx.actor.companyId },
    include: { permissions: { include: { permission: { select: { code: true } } } } },
  });
  if (roles.length !== roleIds.length) {
    throw AppError.unprocessable("Some roles do not exist", [{ path: "roleIds", message: "not found" }]);
  }
  const beyond = [...new Set(roles.flatMap((r) => r.permissions.map((p) => p.permission.code)))]
    .filter((code) => !ctx.actor.permissions.has(code));
  if (beyond.length) {
    throw AppError.forbidden(`You cannot grant permissions you do not hold: ${beyond.sort().join(", ")}`);
  }
  return roles;
}

async function activeAdminCount(tx: Tx, companyId: string, excludingUserId?: string) {
  return tx.user.count({
    where: {
      companyId, isActive: true,
      ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
      roles: { some: { role: { code: ADMIN_ROLE } } },
    },
  });
}

/* ---- Reads --------------------------------------------------------------- */

export async function listUsers(companyId: string) {
  const users = await prisma.user.findMany({
    where: { companyId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true, email: true, name: true, isActive: true, lastLoginAt: true, lockedUntil: true, mustChangePassword: true, createdAt: true,
      roles: { select: { role: { select: { id: true, code: true, name: true } } } },
    },
  });
  const now = new Date();
  return users.map(({ roles, lockedUntil, ...u }) => ({
    ...u,
    locked: lockedUntil !== null && lockedUntil > now,
    roles: roles.map((r) => r.role),
  }));
}

export async function listRoles(companyId: string) {
  const roles = await prisma.role.findMany({
    where: { companyId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      permissions: { include: { permission: { select: { code: true } } } },
      _count: { select: { users: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem,
    users: r._count.users,
    permissions: r.permissions.map((p) => p.permission.code).sort(),
  }));
}

export async function listPermissions() {
  return prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }], select: { code: true, resource: true, action: true, description: true } });
}

/* ---- Users ----------------------------------------------------------------- */

export async function createUser(input: CreateUserInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "user:create");
  const password = input.password ?? temporaryPassword();
  const passwordHash = await hashPassword(password);

  const user = await runInTransaction(async (tx) => {
    const roles = await assertCanGrant(tx, ctx, input.roleIds);
    const clash = await tx.user.findFirst({ where: { companyId: ctx.actor.companyId, email: input.email }, select: { id: true } });
    if (clash) throw AppError.conflict(`A user with the email ${input.email} already exists`);

    const created = await tx.user.create({
      data: {
        companyId: ctx.actor.companyId, email: input.email, name: input.name, passwordHash, mustChangePassword: true,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true, email: true, name: true },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CREATE, entityType: "users", entityId: created.id, entityLabel: created.email,
      newValues: { email: created.email, name: created.name, roles: roles.map((r) => r.code), passwordIssued: true },
    });
    return created;
  });

  // Returned once, only when the server chose it, so the administrator can
  // pass it on. It is never stored or logged in clear.
  return { user, temporaryPassword: input.password ? null : password };
}

export async function updateUser(id: string, input: UpdateUserInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "user:update");
  const companyId = ctx.actor.companyId;

  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "users", id, companyId))) throw AppError.notFound("User", id);
    const user = await tx.user.findUniqueOrThrow({
      where: { id },
      include: { roles: { include: { role: { select: { id: true, code: true } } } } },
    });
    const wasAdmin = user.roles.some((r) => r.role.code === ADMIN_ROLE);

    if (input.isActive === false && id === ctx.actor.userId) throw AppError.conflict("You cannot deactivate your own account");
    // Switching someone off (or back on) is power over their account, like a
    // reset: it needs at least the powers they hold.
    if (input.isActive !== undefined && input.isActive !== user.isActive) {
      await assertCanGrant(tx, ctx, user.roles.map((r) => r.role.id));
    }

    let newRoles: { id: string; code: string }[] | null = null;
    if (input.roleIds) {
      newRoles = await assertCanGrant(tx, ctx, input.roleIds);
      // Taking roles away is also a grant decision: you cannot strip a role
      // whose powers exceed your own.
      const removed = user.roles.filter((r) => !input.roleIds!.includes(r.role.id)).map((r) => r.role.id);
      if (removed.length) await assertCanGrant(tx, ctx, removed);
    }

    const staysAdmin = newRoles ? newRoles.some((r) => r.code === ADMIN_ROLE) : wasAdmin;
    const staysActive = input.isActive ?? user.isActive;
    if (wasAdmin && user.isActive && (!staysAdmin || !staysActive) && (await activeAdminCount(tx, companyId, id)) === 0) {
      throw AppError.conflict("This is the last active administrator; appoint another before removing access");
    }

    await tx.user.update({ where: { id }, data: { name: input.name, isActive: input.isActive } });
    if (newRoles) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: newRoles.map((r) => ({ userId: id, roleId: r.id })) });
    }
    if (input.isActive === false) {
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }

    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "users", entityId: id, entityLabel: user.email,
      previousValues: {
        ...(input.name !== undefined ? { name: user.name } : {}),
        ...(input.isActive !== undefined ? { isActive: user.isActive } : {}),
        ...(newRoles ? { roles: user.roles.map((r) => r.role.code) } : {}),
      },
      newValues: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(newRoles ? { roles: newRoles.map((r) => r.code) } : {}),
      },
    });
  });
}

export async function resetUserPassword(id: string, input: ResetPasswordInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "user:update");
  if (id === ctx.actor.userId) throw AppError.conflict("Change your own password from your profile, not by resetting it");
  const password = input.password ?? temporaryPassword();
  const passwordHash = await hashPassword(password);

  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "users", id, ctx.actor.companyId))) throw AppError.notFound("User", id);
    const user = await tx.user.findUniqueOrThrow({
      where: { id },
      include: { roles: { select: { roleId: true } } },
    });
    // Resetting someone's password is taking over their account; it needs
    // at least their powers.
    await assertCanGrant(tx, ctx, user.roles.map((r) => r.roleId));
    await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    const revoked = await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "users", entityId: id, entityLabel: user.email,
      newValues: { passwordReset: true, sessionsRevoked: revoked.count },
    });
  });
  return { temporaryPassword: input.password ? null : password };
}

export async function unlockUser(id: string, ctx: WriteContext) {
  requirePermission(ctx.actor, "user:update");
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "users", id, ctx.actor.companyId))) throw AppError.notFound("User", id);
    const user = await tx.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null }, select: { email: true } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "users", entityId: id, entityLabel: user.email, newValues: { unlocked: true },
    });
  });
}

/* ---- Roles ------------------------------------------------------------------ */

async function resolvePermissions(tx: Tx, ctx: WriteContext, codes: string[]) {
  const perms = await tx.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const unknown = codes.filter((c) => !perms.some((p) => p.code === c));
  if (unknown.length) throw AppError.unprocessable("Unknown permissions", unknown.map((c) => ({ path: "permissions", message: `${c} does not exist` })));
  const beyond = codes.filter((c) => !ctx.actor.permissions.has(c));
  if (beyond.length) throw AppError.forbidden(`You cannot grant permissions you do not hold: ${beyond.sort().join(", ")}`);
  return perms;
}

export async function createRole(input: CreateRoleInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "role:create");
  return runInTransaction(async (tx) => {
    const perms = await resolvePermissions(tx, ctx, input.permissions);
    const clash = await tx.role.findFirst({ where: { companyId: ctx.actor.companyId, code: input.code }, select: { id: true } });
    if (clash) throw AppError.conflict(`A role with the code ${input.code} already exists`);
    const role = await tx.role.create({
      data: {
        companyId: ctx.actor.companyId, code: input.code, name: input.name, description: input.description ?? null, isSystem: false,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
      select: { id: true, code: true },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CREATE, entityType: "roles", entityId: role.id, entityLabel: role.code,
      newValues: { name: input.name, permissions: input.permissions },
    });
    return role;
  });
}

export async function updateRole(id: string, input: UpdateRoleInput, ctx: WriteContext) {
  requirePermission(ctx.actor, "role:update");
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "roles", id, ctx.actor.companyId))) throw AppError.notFound("Role", id);
    const role = await tx.role.findUniqueOrThrow({
      where: { id },
      include: { permissions: { include: { permission: { select: { code: true } } } } },
    });
    if (role.isSystem) throw AppError.conflict(`${role.code} is a system role and cannot be changed; create a custom role instead`);
    const before = role.permissions.map((p) => p.permission.code).sort();

    if (input.permissions) {
      const perms = await resolvePermissions(tx, ctx, input.permissions);
      // Removing a permission you do not hold is also beyond your authority.
      const removed = before.filter((c) => !input.permissions!.includes(c));
      const beyond = removed.filter((c) => !ctx.actor.permissions.has(c));
      if (beyond.length) throw AppError.forbidden(`You cannot revoke permissions you do not hold: ${beyond.join(", ")}`);
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
    }
    await tx.role.update({
      where: { id },
      data: { name: input.name, description: input.description === undefined ? undefined : input.description || null },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "roles", entityId: id, entityLabel: role.code,
      previousValues: { name: role.name, permissions: before },
      newValues: { name: input.name ?? role.name, permissions: input.permissions ? [...input.permissions].sort() : before },
    });
  });
}

export async function deleteRole(id: string, ctx: WriteContext) {
  requirePermission(ctx.actor, "role:delete");
  await runInTransaction(async (tx) => {
    if (!(await lockRow(tx, "roles", id, ctx.actor.companyId))) throw AppError.notFound("Role", id);
    const role = await tx.role.findUniqueOrThrow({ where: { id }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw AppError.conflict(`${role.code} is a system role and cannot be deleted`);
    if (role._count.users > 0) throw AppError.conflict(`${role.code} is assigned to ${role._count.users} user(s); reassign them first`);
    await tx.role.delete({ where: { id } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.DELETE, entityType: "roles", entityId: id, entityLabel: role.code, previousValues: { name: role.name },
    });
  });
}
