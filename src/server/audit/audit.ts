import { Prisma, type AuditAction } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { logger } from "@/server/logger";

/**
 * The audit trail.
 *
 * Records who changed what, when, and from what to what. Append-only: entries
 * are never updated or deleted, because a trail that can be edited is not a
 * trail.
 *
 * Outside a transaction (sign-in events, say) an audit entry must never break
 * the operation it describes: if the insert fails the error is logged and
 * swallowed. Inside a business transaction (`tx` passed) the entry is part of
 * the change and a failure propagates: Postgres aborts the transaction on any
 * failed statement anyway, and a stock movement that commits without its
 * trail entry is exactly what an audit trail exists to prevent.
 */

export interface AuditInput {
  companyId: string;
  /** Null for actions with no authenticated actor, e.g. a failed login. */
  userId?: string | null;
  action: AuditAction;
  /** Table the change concerns, e.g. "purchase_orders". */
  entityType: string;
  entityId: string;
  /** Business key, kept readable after the row is gone, e.g. "PO-2026-0255". */
  entityLabel?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  requestId?: string | null;
  mrpRunId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Reuse the surrounding transaction so the entry commits with the change. */
  tx?: Prisma.TransactionClient;
}

/** Fields never written to the trail, whatever a caller passes. */
const REDACTED = new Set(["password", "passwordHash", "newPassword", "currentPassword", "token", "tokenHash"]);

function sanitise(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return value as Prisma.InputJsonValue;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED.has(k) ? "[redacted]" : v;
  }
  return out as Prisma.InputJsonValue;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const client = input.tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel ?? null,
        previousValues: sanitise(input.previousValues),
        newValues: sanitise(input.newValues),
        requestId: input.requestId ?? null,
        mrpRunId: input.mrpRunId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    if (input.tx) throw error;
    logger.error(
      { err: error, entityType: input.entityType, entityId: input.entityId, action: input.action },
      "failed to write audit entry",
    );
  }
}

/**
 * Field-level diff of two records.
 *
 * Logging whole objects makes the trail unreadable — the question a reader
 * has is "what changed", not "what did the row look like". Returns null when
 * nothing changed, so callers can skip writing a no-op entry.
 */
export function diffValues<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  ignore: string[] = ["updatedAt", "createdAt"],
): { previous: Record<string, unknown>; next: Record<string, unknown> } | null {
  const skip = new Set(ignore);
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(after)) {
    if (skip.has(key)) continue;
    const old = before[key];
    // Compared as strings so Decimal, Date and number forms of the same
    // value do not register as a change.
    if (String(old ?? "") === String(value ?? "")) continue;
    previous[key] = old ?? null;
    next[key] = value ?? null;
  }

  return Object.keys(next).length ? { previous, next } : null;
}
