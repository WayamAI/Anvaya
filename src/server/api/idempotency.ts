import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/server/db/client";
import { runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError } from "@/server/errors/app-error";

/**
 * Idempotent POSTs.
 *
 * A goods receipt or dispatch posted twice — a double click, a retry after a
 * timeout whose first attempt actually committed — must move stock once. A
 * client sends `Idempotency-Key: <uuid>`; the first request with that key
 * runs and its response is stored in the same transaction as the business
 * change. Any later request with the key gets the stored response back
 * without running again.
 *
 * Concurrent duplicates: both requests may pass the initial lookup and run.
 * The key row is inserted inside each transaction, so the second insert
 * hits the unique index, its whole transaction rolls back — nothing it did
 * is kept — and it replays the first request's stored result instead.
 *
 * A key reused with a different body is refused with 422 rather than
 * replayed: returning an old receipt for a new request would be a silent lie.
 */

export const IDEMPOTENCY_HEADER = "idempotency-key";

export interface IdempotencyContext {
  companyId: string;
  userId: string;
  key: string;
  scope: string;
  requestHash: string;
}

export interface StoredResponse<T> {
  status: number;
  body: T;
  replayed: boolean;
}

/** Stable hash of a parsed body: keys sorted, so field order does not matter. */
export function hashBody(body: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
        : v;
  return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}

export function readIdempotencyKey(req: NextRequest): string | null {
  const key = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!key) return null;
  if (key.length > 200 || !/^[\w.:-]+$/.test(key)) {
    throw AppError.validation("Idempotency-Key must be 1–200 characters of letters, digits, '-', '_', '.' or ':'");
  }
  return key;
}

async function findStored<T>(ctx: IdempotencyContext): Promise<StoredResponse<T> | null> {
  const row = await prisma.idempotencyKey.findUnique({
    where: { companyId_key: { companyId: ctx.companyId, key: ctx.key } },
  });
  if (!row) return null;
  if (row.scope !== ctx.scope || row.requestHash !== ctx.requestHash || row.userId !== ctx.userId) {
    throw AppError.unprocessable(
      "This Idempotency-Key was already used for a different request. Generate a new key for a new request.",
    );
  }
  return { status: row.responseStatus, body: row.responseBody as T, replayed: true };
}

const isKeyConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002" &&
  String((error.meta as { modelName?: string; target?: unknown })?.modelName ?? error.meta?.target ?? "").includes("dempotency");

/**
 * Run `fn` in a transaction, once per key. Without a key it simply runs in a
 * transaction — idempotency is opt-in by the client.
 */
export async function runIdempotent<T>(
  ctx: IdempotencyContext | null,
  status: number,
  fn: (tx: Tx) => Promise<T>,
): Promise<StoredResponse<T>> {
  if (!ctx) return { status, body: await runInTransaction(fn), replayed: false };

  const earlier = await findStored<T>(ctx);
  if (earlier) return earlier;

  try {
    const body = await runInTransaction(async (tx) => {
      const result = await fn(tx);
      await tx.idempotencyKey.create({
        data: {
          companyId: ctx.companyId,
          userId: ctx.userId,
          key: ctx.key,
          scope: ctx.scope,
          requestHash: ctx.requestHash,
          responseStatus: status,
          responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      return result;
    });
    return { status, body, replayed: false };
  } catch (error) {
    if (isKeyConflict(error)) {
      const winner = await findStored<T>(ctx);
      if (winner) return winner;
    }
    throw error;
  }
}
