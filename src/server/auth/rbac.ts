import { AppError } from "@/server/errors/app-error";
import type { Actor } from "./session";

/**
 * Role-based access control.
 *
 * Permissions are checked here, in code the service layer calls, rather than
 * in route handlers or by hiding buttons. Hiding a button stops nobody: the
 * endpoint is still there and still reachable with curl. A service that
 * mutates data must be unable to do so without an actor who holds the right.
 *
 * Roles are data — a bag of permissions in the database — so `ADMIN` carries
 * no special meaning in this file beyond holding every permission row.
 */

/** `resource:action`, matching the seeded permission catalogue. */
export type PermissionCode = string;

export function hasPermission(actor: Actor | null, code: PermissionCode): boolean {
  return actor?.permissions.has(code) ?? false;
}

export function hasAnyPermission(actor: Actor | null, codes: PermissionCode[]): boolean {
  return codes.some((c) => hasPermission(actor, c));
}

export function hasAllPermissions(actor: Actor | null, codes: PermissionCode[]): boolean {
  return codes.every((c) => hasPermission(actor, c));
}

/**
 * The gate every mutating service method calls.
 *
 * Throws rather than returning a boolean so a forgotten `if` cannot silently
 * allow the action — the failure mode of a missed check is a 403, not a
 * quiet success.
 */
export function requirePermission(actor: Actor | null, code: PermissionCode): asserts actor is Actor {
  if (!actor) throw AppError.unauthenticated();
  if (!actor.permissions.has(code)) {
    throw AppError.forbidden(`This action requires the '${code}' permission`);
  }
}

export function requireAnyPermission(actor: Actor | null, codes: PermissionCode[]): asserts actor is Actor {
  if (!actor) throw AppError.unauthenticated();
  if (!hasAnyPermission(actor, codes)) {
    throw AppError.forbidden(`This action requires one of: ${codes.join(", ")}`);
  }
}

export function requireAuthenticated(actor: Actor | null): asserts actor is Actor {
  if (!actor) throw AppError.unauthenticated();
}

/**
 * Guard against cross-tenant access.
 *
 * Every business table carries a companyId. A record fetched by id alone
 * could belong to another tenant, so services that look up by id must pass
 * the row's companyId through here before acting on it. Reported as
 * not-found rather than forbidden: confirming a record exists in a company
 * you cannot see is itself a leak.
 */
export function requireSameCompany(actor: Actor, companyId: string, resource = "Record"): void {
  if (actor.companyId !== companyId) {
    throw AppError.notFound(resource);
  }
}

/** Serialisable actor for the client — the Set is not JSON-friendly. */
export function toPublicActor(actor: Actor) {
  return {
    id: actor.userId,
    email: actor.email,
    name: actor.name,
    companyId: actor.companyId,
    roles: actor.roles,
    permissions: [...actor.permissions].sort(),
  };
}
