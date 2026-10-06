import { AuditAction } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { hashPassword, verifyPassword, verifyOrDummy } from "@/server/auth/password";
import {
  createSession, resolveSession, revokeSession, revokeAllSessionsForUser,
  type Actor, type SessionContext,
} from "@/server/auth/session";
import { recordAudit } from "@/server/audit/audit";
import type { LoginInput, ChangePasswordInput } from "@/server/validation/auth";

/**
 * Authentication business logic.
 *
 * Framework-free on purpose: no NextRequest, no cookies, no redirects. The
 * route handler deals with HTTP and cookies; this decides who may sign in.
 * That separation is what lets the rules be tested without a server.
 */

/** Failed attempts before an account is temporarily locked. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60_000;

export interface LoginResult {
  token: string;
  expiresAt: Date;
  actor: Actor;
}

/**
 * Verify credentials and open a session.
 *
 * Every failure path returns the same message. Distinguishing "no such user"
 * from "wrong password" hands an attacker a free account enumerator, and
 * saying "account locked" tells them the address is real and worth pursuing.
 *
 * Companies share the database and an email is unique only within one, so
 * the account is looked up by company code and email together — never by
 * email alone. An unknown or inactive company fails like a wrong password,
 * at the same hashing cost.
 */
export async function login(input: LoginInput, ctx: SessionContext = {}): Promise<LoginResult> {
  const generic = "Incorrect company, email or password";

  const company = await prisma.company.findUnique({ where: { code: input.company }, select: { id: true, isActive: true } });
  const user = !company?.isActive ? null : await prisma.user.findUnique({
    where: { companyId_email: { companyId: company.id, email: input.email } },
    select: {
      id: true, companyId: true, email: true, name: true,
      passwordHash: true, isActive: true,
      failedLoginCount: true, lockedUntil: true,
    },
  });

  // Still hashes when the user is missing, so both paths cost the same.
  const passwordOk = await verifyOrDummy(input.password, user?.passwordHash ?? null);

  if (!user) {
    logger.warn({ company: input.company, email: input.email, ip: ctx.ipAddress }, "login failed: unknown account");
    throw AppError.unauthenticated(generic);
  }

  const locked = user.lockedUntil !== null && user.lockedUntil > new Date();
  if (locked) {
    await audit(user.companyId, user.id, AuditAction.LOGIN_FAILED, "locked", ctx);
    logger.warn({ userId: user.id }, "login failed: account locked");
    throw AppError.unauthenticated(generic);
  }

  if (!user.isActive) {
    await audit(user.companyId, user.id, AuditAction.LOGIN_FAILED, "inactive", ctx);
    throw AppError.unauthenticated(generic);
  }

  if (!passwordOk) {
    // Incremented in the database, not from the value read above: concurrent
    // wrong guesses each count, so a burst cannot slip past the lock-out.
    const { failedLoginCount: failed } = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const shouldLock = failed >= MAX_FAILED_ATTEMPTS;
    if (shouldLock) {
      await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) } });
    }
    await audit(user.companyId, user.id, AuditAction.LOGIN_FAILED, "bad password", ctx);
    logger.warn({ userId: user.id, failed, locked: shouldLock }, "login failed: bad password");
    throw AppError.unauthenticated(generic);
  }

  // Success clears the counter, so a typo followed by a correct password does
  // not accumulate towards a lockout.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const { token, expiresAt, sessionId } = await createSession(user.id, ctx);
  const actor = await resolveSession(token);
  if (!actor) throw AppError.internal("Session could not be established");

  await audit(user.companyId, user.id, AuditAction.LOGIN, "success", ctx, sessionId);
  logger.info({ userId: user.id, sessionId }, "login succeeded");

  return { token, expiresAt, actor };
}

export async function logout(actor: Actor, ctx: SessionContext = {}) {
  await revokeSession(actor.sessionId);
  await audit(actor.companyId, actor.userId, AuditAction.LOGOUT, "success", ctx, actor.sessionId);
  logger.info({ userId: actor.userId, sessionId: actor.sessionId }, "logout");
}

/**
 * Change the acting user's password.
 *
 * Every other session is revoked on success: if the password was changed
 * because it may have leaked, leaving the attacker's session alive defeats
 * the point. The current session survives so the user is not logged out of
 * the tab they are using.
 */
export async function changePassword(actor: Actor, input: ChangePasswordInput, ctx: SessionContext = {}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { id: true, passwordHash: true },
  });

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw AppError.validation("Your current password is incorrect", [
      { path: "currentPassword", message: "Incorrect password" },
    ]);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
  });

  const revoked = await revokeAllSessionsForUser(actor.userId, actor.sessionId);

  await recordAudit({
    companyId: actor.companyId,
    userId: actor.userId,
    action: AuditAction.UPDATE,
    entityType: "users",
    entityId: actor.userId,
    entityLabel: actor.email,
    // Never the values themselves, only that the field changed.
    newValues: { passwordChanged: true, otherSessionsRevoked: revoked },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  logger.info({ userId: actor.userId, revoked }, "password changed");
  return { otherSessionsRevoked: revoked };
}

export async function signOutEverywhere(actor: Actor) {
  const count = await revokeAllSessionsForUser(actor.userId);
  logger.info({ userId: actor.userId, count }, "all sessions revoked");
  return { revoked: count };
}

function audit(
  companyId: string,
  userId: string | null,
  action: AuditAction,
  label: string,
  ctx: SessionContext,
  sessionId?: string,
) {
  return recordAudit({
    companyId,
    userId,
    action,
    entityType: "sessions",
    entityId: sessionId ?? "-",
    entityLabel: label,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });
}
