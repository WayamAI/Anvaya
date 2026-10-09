import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, ErrorCode, type ErrorDetail } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { fail } from "./respond";
import { env, isProduction } from "@/server/config/env";
import { resolveSession, touchSession, SESSION_COOKIE, type Actor } from "@/server/auth/session";
import { requireAuthenticated, requirePermission } from "@/server/auth/rbac";

/**
 * The wrapper every route handler is built from.
 *
 * It owns the cross-cutting concerns so handlers do not repeat them: a request
 * id, timing, structured logging, and the single translation point from thrown
 * errors to HTTP responses. A handler's job shrinks to "validate, authorize,
 * call a service, return".
 *
 * Handlers are expected to THROW on failure rather than assembling error
 * responses themselves. That keeps the service layer free of HTTP concepts and
 * guarantees every error leaves through the same door.
 */

export interface ApiContext<P = Record<string, string>> {
  req: NextRequest;
  params: P;
  requestId: string;
  log: typeof logger;
  /**
   * The authenticated user, or null. Always resolved from the session cookie,
   * never from anything the client can assert about itself.
   */
  actor: Actor | null;
  /** Client address and agent, for session records and the audit trail. */
  clientInfo: { ipAddress: string | null; userAgent: string | null };
}

type Handler<P> = (ctx: ApiContext<P>) => Promise<NextResponse> | NextResponse;

export interface WithApiOptions {
  /**
   * Require a signed-in user. Defaults to true: an endpoint is private unless
   * it says otherwise, so forgetting to think about auth fails closed.
   */
  auth?: boolean;
  /** Permission the caller must hold. Implies `auth`. */
  permission?: string;
}

export function withApi<P = Record<string, string>>(
  handler: Handler<P>,
  options: WithApiOptions = {},
) {
  const { auth = true, permission } = options;

  return async (req: NextRequest, route?: { params: P }): Promise<NextResponse> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = performance.now();
    const log = logger.child({ requestId, method: req.method, path: new URL(req.url).pathname });

    try {
      const clientInfo = {
        // Behind a proxy the socket address is the proxy's, so the forwarded
        // header is preferred where present.
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          req.headers.get("x-real-ip") ??
          null,
        userAgent: req.headers.get("user-agent"),
      };

      assertSameOrigin(req);

      const actor = await resolveSession(req.cookies.get(SESSION_COOKIE)?.value);

      if (auth || permission) requireAuthenticated(actor);
      if (actor?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(new URL(req.url).pathname)) {
        throw AppError.forbidden("You must set a new password before continuing");
      }
      if (permission) requirePermission(actor, permission);

      // Sliding expiry, written at most once a minute per session.
      if (actor?.lastActivityAt && actor.sessionCreatedAt) {
        void touchSession(actor.sessionId, actor.lastActivityAt, actor.sessionCreatedAt);
      }

      const res = await handler({
        req,
        params: (route?.params ?? {}) as P,
        requestId,
        log: actor ? log.child({ userId: actor.userId }) : log,
        actor,
        clientInfo,
      });

      res.headers.set("x-request-id", requestId);
      log.info({ status: res.status, durationMs: Math.round(performance.now() - started) }, "request");
      return res;
    } catch (error) {
      return handleError(error, requestId, log, started);
    }
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** All a user with an administrator-issued password may do until they replace it. */
const PASSWORD_CHANGE_ALLOWED = new Set(["/api/v1/auth/change-password", "/api/v1/auth/me", "/api/v1/auth/logout"]);

/**
 * Cross-site request forgery guard for state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already keeps it off cross-site
 * POSTs in current browsers. This is the second layer: a browser always sends
 * `Origin` on a cross-origin POST/PATCH/DELETE, and one naming another site is
 * refused before the session is even looked at. Requests without `Origin`
 * (curl, server-to-server) carry no ambient browser cookie to abuse and pass.
 */
export function assertSameOrigin(req: NextRequest): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw AppError.forbidden("Cross-site request refused");
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const appHost = new URL(env.APP_URL).host;
  if (originHost !== host && originHost !== appHost) {
    throw AppError.forbidden("Cross-site request refused");
  }
}

function handleError(
  error: unknown,
  requestId: string,
  log: typeof logger,
  started: number,
): NextResponse {
  const durationMs = Math.round(performance.now() - started);

  // Expected, typed failures. Logged at warn — they are outcomes, not bugs.
  if (AppError.is(error)) {
    log.warn(
      { code: error.code, status: error.status, durationMs, context: error.context },
      error.message,
    );
    const res = fail(error.status, error.code, error.message, requestId, error.details);
    const retryAfter = error.context?.retryAfterSeconds;
    if (typeof retryAfter === "number") res.headers.set("Retry-After", String(retryAfter));
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Validation that escaped a handler without being converted.
  if (error instanceof ZodError) {
    const details = toDetails(error);
    log.warn({ durationMs, details }, "validation failed");
    return fail(422, ErrorCode.VALIDATION_FAILED, "The submitted data is invalid", requestId, details);
  }

  const prismaMapped = mapPrismaError(error);
  if (prismaMapped) {
    log.warn({ code: prismaMapped.code, durationMs, err: error }, prismaMapped.message);
    return fail(prismaMapped.status, prismaMapped.code, prismaMapped.message, requestId, prismaMapped.details);
  }

  // Anything reaching here is a bug. Log the stack; tell the client nothing.
  log.error({ err: error, durationMs }, "unhandled error");
  return fail(
    500,
    ErrorCode.INTERNAL,
    isProduction
      ? "An unexpected error occurred"
      : `An unexpected error occurred: ${(error as Error)?.message ?? String(error)}`,
    requestId,
  );
}

/** Zod issues → the flat, form-friendly detail shape. */
export function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((i) => ({
    path: i.path.join(".") || "(root)",
    message: i.message,
  }));
}

/**
 * Database constraint violations are business outcomes, not server faults —
 * a duplicate material code is a 409, never a 500.
 */
function mapPrismaError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (error.code) {
    case "P2002": {
      const target = (error.meta?.target as string[] | undefined)?.join(", ");
      return {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: target
          ? `A record with this ${target} already exists`
          : "A record with these values already exists",
        details: target ? [{ path: target, message: "must be unique" }] : undefined,
      };
    }
    case "P2003":
      return {
        status: 409,
        code: ErrorCode.CONFLICT,
        message: "A referenced record does not exist",
        details: undefined,
      };
    // A value past its column's precision. Inputs are bounded at the door,
    // so this is a backstop; the driver's wording stays in the log.
    case "P2020":
      return {
        status: 422,
        code: ErrorCode.VALIDATION_FAILED,
        message: "A value is too large to record",
        details: undefined,
      };
    case "P2025":
      return {
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: "The requested record was not found",
        details: undefined,
      };
    default:
      return null;
  }
}

/** Parse and validate a JSON body, throwing the standard validation error. */
/** Any input shape: a schema may transform what it parses (e.g. a comma list into an array). */
type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

/**
 * Largest JSON body any endpoint accepts. The biggest legitimate payloads (a
 * goods receipt or an order with many lines) are a few tens of KB; the cap
 * stops a client — including an unauthenticated one, since login parses its
 * body before anything else — making the server buffer and parse megabytes.
 */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Read the body as text, refusing it as soon as it passes `maxBytes`. */
export async function readBodyCapped(req: Request, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw AppError.payloadTooLarge(maxBytes);
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw AppError.payloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function parseBody<T>(req: NextRequest, schema: Schema<T>): Promise<T> {
  const text = await readBodyCapped(req);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw AppError.validation("Request body must be valid JSON");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation("The submitted data is invalid", toDetails(result.error));
  }
  return result.data;
}

/** Parse and validate the query string the same way. */
export function parseQuery<T>(req: NextRequest, schema: Schema<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    throw AppError.validation("Invalid query parameters", toDetails(result.error));
  }
  return result.data;
}
