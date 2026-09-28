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
