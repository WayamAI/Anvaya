import { NextResponse } from "next/server";
import type { ErrorCode, ErrorDetail } from "@/server/errors/app-error";

/**
 * The response envelope every endpoint uses.
 *
 * One shape for success and one for failure, so the frontend can write a
 * single unwrapping helper instead of special-casing each endpoint.
 */

export interface PageMeta {
  /** Opaque cursor for the next page; null when this is the last one. */
  nextCursor: string | null;
  /** Total matching rows, when it can be computed cheaply. */
  total?: number;
  limit: number;
}

export interface SuccessBody<T> {
  data: T;
  meta?: PageMeta & Record<string, unknown>;
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    /** Correlates the client-visible failure with the server log line. */
    requestId: string;
  };
}

export function ok<T>(data: T, init?: { status?: number; meta?: SuccessBody<T>["meta"] }) {
  const body: SuccessBody<T> = { data };
  if (init?.meta) body.meta = init.meta;
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function created<T>(data: T, location?: string) {
  const res = NextResponse.json<SuccessBody<T>>({ data }, { status: 201 });
  if (location) res.headers.set("Location", location);
  return res;
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
) {
  const body: ErrorBody = { error: { code, message, requestId } };
  if (details?.length) body.error.details = details;
  return NextResponse.json(body, { status });
}
