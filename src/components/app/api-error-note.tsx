"use client";

import type { ApiError } from "@/lib/api";

/** Shared pieces for forms that write through the API. */

/**
 * One key per user intent: generate when a form opens, not per click, so a
 * double submit or a retry is recognised by the server as the same request.
 */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Server message, plus each field-level problem the server named. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-body-sm text-danger">
      <p className="font-medium">{e.message}</p>
      {e.details?.length ? (
        <ul className="mt-1 list-disc pl-4">
          {e.details.map((d, i) => <li key={i}><span className="identifier">{d.path}</span>: {d.message}</li>)}
        </ul>
      ) : null}
      {e.requestId && <p className="mt-1 text-caption opacity-70">Reference {e.requestId}</p>}
    </div>
  );
}
