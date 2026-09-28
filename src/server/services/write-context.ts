import type { Actor } from "@/server/auth/session";

/**
 * What every write service needs to know about the request: who is acting,
 * and enough about the request to put it on the audit trail.
 */
export interface WriteContext {
  actor: Actor;
  requestId: string;
  clientInfo: { ipAddress: string | null; userAgent: string | null };
}

/** The audit fields that come from the request rather than the change. */
export function auditMeta(ctx: WriteContext) {
  return {
    companyId: ctx.actor.companyId,
    userId: ctx.actor.userId,
    requestId: ctx.requestId,
    ipAddress: ctx.clientInfo.ipAddress,
    userAgent: ctx.clientInfo.userAgent,
  };
}
