/**
 * The error taxonomy the whole backend speaks.
 *
 * Services throw these; the API wrapper is the only place that turns them into
 * HTTP. That keeps the service layer framework-free — the same service can be
 * called from a route handler, a seed script or a test without dragging
 * `NextResponse` along with it.
 *
 * Anything thrown that is NOT an AppError is treated as a bug: it is logged
 * with its stack and reported to the client as a generic 500, so an internal
 * message never leaks out.
 */

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Field-level detail, shaped so a form can map it straight onto inputs. */
export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetail[];
  /** Context for the log line only. Never serialised to the client. */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; context?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.context = options.context;
    Error.captureStackTrace?.(this, AppError);
  }

  /* ---- Constructors, named for how they read at the call site ---------- */

  static validation(message: string, details?: ErrorDetail[]) {
    return new AppError(ErrorCode.VALIDATION_FAILED, message, { details });
  }

  static unauthenticated(message = "Authentication required") {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
  }

  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  /** `notFound("Material", "RM-4023")` → `Material 'RM-4023' was not found`. */
  static notFound(resource: string, identifier?: string | number) {
    return new AppError(
      ErrorCode.NOT_FOUND,
      identifier === undefined
        ? `${resource} was not found`
        : `${resource} '${identifier}' was not found`,
      { context: { resource, identifier } },
    );
  }

  /** Duplicate business key, or a state transition the data does not allow. */
  static conflict(message: string, context?: Record<string, unknown>) {
    return new AppError(ErrorCode.CONFLICT, message, { context });
  }

  /** Well-formed input that the domain rejects (e.g. a BOM cycle). */
  static unprocessable(message: string, details?: ErrorDetail[]) {
    return new AppError(ErrorCode.UNPROCESSABLE, message, { details });
  }

  static rateLimited(message = "Too many requests — please slow down") {
    return new AppError(ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = "An unexpected error occurred", cause?: unknown) {
    return new AppError(ErrorCode.INTERNAL, message, { cause });
  }

  static is(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
