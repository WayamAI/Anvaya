/**
 * Client-side API access.
 *
 * Every endpoint answers with `{ data, meta? }` or `{ error }` (see
 * src/server/api/respond.ts), so one helper unwraps them all. A failure is
 * thrown as ApiError, which React Query surfaces as the query's `error`.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    /** Field-level problems, keyed by body path (e.g. "lines.0.receivedQty"). */
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiResult<T, M = Record<string, unknown>> {
  data: T;
  meta?: M;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiGetWithMeta<T, M = Record<string, unknown>>(
  path: string,
  query?: Query,
  init?: { signal?: AbortSignal },
): Promise<ApiResult<T, M>> {
  let res: Response;
  try {
    res = await fetch(withQuery(`/api/v1${path}`, query), {
      credentials: "include",
      cache: "no-store",
      signal: init?.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, "NETWORK");
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(
      e?.message ?? `Request failed (${res.status})`,
      res.status,
      e?.code ?? "UNKNOWN",
      e?.requestId,
    );
  }

  return body as ApiResult<T, M>;
}

export async function apiGet<T>(path: string, query?: Query, init?: { signal?: AbortSignal }): Promise<T> {
  return (await apiGetWithMeta<T>(path, query, init)).data;
}

/**
 * POST / PATCH / DELETE. Returns the unwrapped `data` (undefined for 204).
 *
 * `idempotencyKey` should be generated once per user intent (when a form
 * opens), not per click, so a double submit or a retry after a timeout is
 * recognised by the server as the same request and applied once.
 */
export async function apiSend<T = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0, "NETWORK");
  }

  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = payload?.error;
    throw new ApiError(e?.message ?? `Request failed (${res.status})`, res.status, e?.code ?? "UNKNOWN", e?.requestId, e?.details ?? []);
  }
  return payload?.data as T;
}
