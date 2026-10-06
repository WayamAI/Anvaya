import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/server/db/client";
import { env } from "@/server/config/env";

/**
 * Server-side sessions.
 *
 * The session record is the source of truth, not the cookie. That is what
 * makes "sign out everywhere", forced logout on a role change, and an audit
 * of active sessions possible — none of which a self-contained JWT can do,
 * because a JWT stays valid until it expires no matter what the server wants.
 *
 * The cookie carries a random 256-bit token. Only its SHA-256 is stored, so a
 * database leak does not hand over live sessions: an attacker would have to
 * invert the hash to forge a cookie.
 */

const TOKEN_BYTES = 32;

export const SESSION_COOKIE = "anvaya.session";

/** Hash a raw token for storage or lookup. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface SessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Issue a session. Returns the raw token, which is the only moment it exists
 * outside the client — it is never stored and cannot be recovered afterwards.
 */
export async function createSession(userId: string, ctx: SessionContext = {}) {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return { token: raw, expiresAt, sessionId: session.id };
}

export interface Actor {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  sessionId: string;
  roles: string[];
  /** Flattened permission codes, e.g. "material:create". */
  permissions: Set<string>;
  /** An administrator-issued password must be replaced before anything else. */
  mustChangePassword?: boolean;
  /** For the sliding idle window; see `touchSession`. */
  lastActivityAt?: Date;
  sessionCreatedAt?: Date;
}

/**
 * Where a session's expiry moves to on activity: the idle window from now,
 * but never past the absolute cap from sign-in.
 */
export function slidingExpiry(now: Date, createdAt: Date): Date {
  const idle = now.getTime() + env.SESSION_MAX_AGE_SECONDS * 1000;
  const cap = createdAt.getTime() + env.SESSION_ABSOLUTE_MAX_SECONDS * 1000;
  return new Date(Math.min(idle, cap));
}

/**
 * Resolve a raw cookie token to the acting user, or null.
 *
 * Returns null for an unknown, expired, revoked or deactivated session rather
 * than throwing, so callers can decide whether that means "redirect to login"
 * or "401".
 */
export async function resolveSession(rawToken: string | undefined | null): Promise<Actor | null> {
  if (!rawToken) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;
  if (!session.user.isActive) return null;

  const permissions = new Set<string>();
  const roles: string[] = [];
  for (const { role } of session.user.roles) {
    roles.push(role.code);
    for (const rp of role.permissions) permissions.add(rp.permission.code);
  }

  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    email: session.user.email,
    name: session.user.name,
    sessionId: session.id,
    roles,
    permissions,
    mustChangePassword: session.user.mustChangePassword,
    lastActivityAt: session.lastActivityAt,
    sessionCreatedAt: session.createdAt,
  };
}

/**
 * Extend a session's sliding window: activity pushes expiry out to the idle
 * window from now, capped at the absolute maximum from sign-in.
 *
 * `lastActivityAt` is the value stored on the session, as resolved for this
 * request. Only written when that is more than a minute old: a busy page
 * would otherwise issue an UPDATE per request for no benefit.
 */
export async function touchSession(sessionId: string, lastActivityAt: Date, createdAt: Date) {
  const now = new Date();
  if (now.getTime() - lastActivityAt.getTime() < 60_000) return;
  await prisma.session
    .update({ where: { id: sessionId }, data: { lastActivityAt: now, expiresAt: slidingExpiry(now, createdAt) } })
    .catch(() => {
      // A session revoked between resolve and touch is not an error worth
      // failing the request over; the next resolve will reject it.
    });
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Used when a password changes, or the user asks to sign out everywhere. */
export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string) {
  const { count } = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return count;
}

/**
 * Constant-time comparison for any place a caller compares secrets directly.
 * Exported because `===` on secrets is exactly the kind of thing that looks
 * harmless in review.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const __testing = { hashToken };
