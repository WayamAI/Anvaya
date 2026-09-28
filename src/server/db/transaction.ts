import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { logger } from "@/server/logger";

/**
 * Interactive transactions for the write side.
 *
 * Every business write that touches more than one row — a goods receipt
 * creates the receipt, its lines, lots and ledger rows, and moves the PO —
 * runs through here, so it commits whole or not at all.
 *
 * Isolation is Postgres' default READ COMMITTED. Correctness under
 * concurrency comes from explicit row locks (`SELECT ... FOR UPDATE`, see
 * `lockRow` and the stock ledger), which serialise exactly the rows that
 * conflict and nothing else. Locks are taken in a stable order, but a
 * deadlock or serialization failure is still possible under load, so those
 * two — and only those two — are retried: the whole transaction is replayed
 * from the start, which is safe because nothing in it has committed.
 */

export type Tx = Prisma.TransactionClient;

const RETRYABLE_SQLSTATE = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

const MAX_ATTEMPTS = 3;

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: "Transaction failed due to a write conflict or a deadlock".
    if (error.code === "P2034") return true;
    const sqlState = (error.meta as { code?: string } | undefined)?.code;
    if (sqlState && RETRYABLE_SQLSTATE.has(sqlState)) return true;
  }
  const message = (error as Error)?.message ?? "";
  return /deadlock detected|could not serialize access/i.test(message);
}

export async function runInTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        // Waiting for a connection from the pool.
        maxWait: 5_000,
        // Ceiling on the transaction itself; a receipt of a few hundred lines
        // finishes well inside this.
        timeout: options.timeoutMs ?? 20_000,
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
        logger.warn({ attempt, err: (error as Error).message }, "transaction conflict, retrying");
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Lock one row for the rest of the transaction and report whether it exists
 * in the caller's company. The table name comes from a fixed list, never
 * from input.
 */
const LOCKABLE = {
  purchase_orders: true,
  sales_orders: true,
  work_orders: true,
  inventory_lots: false, // lots carry no companyId; scoped through their material
  materials: true,
  vendors: true,
  customers: true,
  locations: true,
  users: true,
  roles: true,
  boms: true,
} as const;

export type LockableTable = keyof typeof LOCKABLE;

export async function lockRow(tx: Tx, table: LockableTable, id: string, companyId: string): Promise<boolean> {
  const rows = LOCKABLE[table]
    ? await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`
        SELECT l.id FROM "inventory_lots" l JOIN "materials" m ON m.id = l."materialId"
        WHERE l.id = ${id} AND m."companyId" = ${companyId} FOR UPDATE OF l`;
  return rows.length > 0;
}
