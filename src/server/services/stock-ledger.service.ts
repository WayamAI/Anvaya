import { Prisma, type StockMovementType } from "@prisma/client";
import { AppError } from "@/server/errors/app-error";
import type { Tx } from "@/server/db/transaction";
import {
  applyMovement, movingAverageCost, shiftBucket, type BalanceState, type Bucket,
} from "@/server/inventory/ledger";

/**
 * Posting to the stock ledger.
 *
 * The only code that writes StockMovement or changes InventoryBalance
 * quantities. Callers run inside `runInTransaction`; the balance row is
 * locked `FOR UPDATE` before it is read, so two postings to the same
 * material and location serialise and each sees the other's result — the
 * running balance on every movement is exact, never a stale read plus a
 * delta.
 *
 * Lock order, for every write in the system:
 *
 *   document row (PO, SO, WO) → balances, by (materialId, locationId)
 *   → lots → document-number sequences
 *
 * Callers posting several lines call `lockBalances` with all their keys
 * first, so two multi-line transactions can never hold each other's rows in
 * opposite orders.
 */

export interface BalanceKey {
  materialId: string;
  locationId: string;
}

const keyOf = (k: BalanceKey) => `${k.materialId}|${k.locationId}`;

interface LockedBalance extends BalanceState {
  id: string;
}

/** Ensure the balance rows exist, then lock them in a stable order. */
export async function lockBalances(tx: Tx, keys: BalanceKey[]): Promise<Map<string, LockedBalance>> {
  // Reduced to the two key fields: callers may pass richer objects (a whole
  // movement), which must not leak into the upsert.
  const unique = [...new Map(keys.map((k) => [keyOf(k), { materialId: k.materialId, locationId: k.locationId }])).values()].sort((a, b) =>
    keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0,
  );
  const out = new Map<string, LockedBalance>();
  for (const k of unique) {
    await tx.inventoryBalance.upsert({
      where: { materialId_locationId: k },
      update: {},
      create: { ...k },
    });
    const [row] = await tx.$queryRaw<LockedBalance[]>`
      SELECT id, "onHandQty", "quarantineQty", valuation FROM "inventory_balances"
      WHERE "materialId" = ${k.materialId} AND "locationId" = ${k.locationId} FOR UPDATE`;
    out.set(keyOf(k), {
      id: row.id,
      onHandQty: new Prisma.Decimal(row.onHandQty),
      quarantineQty: new Prisma.Decimal(row.quarantineQty),
      valuation: new Prisma.Decimal(row.valuation),
    });
  }
  return out;
}

export interface MovementInput extends BalanceKey {
  type: StockMovementType;
  /** Signed. */
  quantity: Prisma.Decimal;
  bucket: Bucket;
  /** Required for inflows. */
  unitCost?: Prisma.Decimal | null;
  lotId?: string | null;
  referenceType: string;
  referenceId: string;
  occurredAt: Date;
  notes?: string | null;
  postedById: string;
  /** Material code, for readable error messages. */
  label?: string;
}

export interface PostedMovement {
  id: string;
  balanceAfter: Prisma.Decimal;
  unitCost: Prisma.Decimal;
}

/**
 * Post one movement. Outflows against a lot also draw the lot down; the lot
 * must hold enough. Inflows into a lot are recorded by the caller when it
 * creates the lot, since a receipt is what brings the lot into existence.
 */
export async function postMovement(tx: Tx, m: MovementInput, locked?: Map<string, LockedBalance>): Promise<PostedMovement> {
  const balances = locked?.has(keyOf(m)) ? locked : await lockBalances(tx, [m]);
  const current = balances.get(keyOf(m))!;

  const next = applyMovement(current, { quantity: m.quantity, bucket: m.bucket, unitCost: m.unitCost }, m.label);

  if (m.lotId && m.quantity.lt(0)) {
    const out = m.quantity.negated();
    const drawn = await tx.inventoryLot.updateMany({
      where: { id: m.lotId, remainingQty: { gte: out } },
      data: { remainingQty: { decrement: out }, consumedQty: { increment: out } },
    });
    if (drawn.count === 0) {
      const lot = await tx.inventoryLot.findUnique({ where: { id: m.lotId }, select: { lotNumber: true, remainingQty: true } });
      throw AppError.unprocessable(
        `Lot ${lot?.lotNumber ?? m.lotId} has ${lot?.remainingQty.toString() ?? 0} remaining; cannot take ${out.toString()}`,
        [{ path: "quantity", message: "exceeds the lot's remaining quantity" }],
      );
    }
  }

  await tx.inventoryBalance.update({
    where: { id: current.id },
    data: {
      onHandQty: next.onHandQty,
      quarantineQty: next.quarantineQty,
      valuation: next.valuation,
      lastMovementAt: m.occurredAt,
    },
  });
  // Keep the in-memory copy current for the next posting in this transaction.
  balances.set(keyOf(m), { id: current.id, onHandQty: next.onHandQty, quarantineQty: next.quarantineQty, valuation: next.valuation });

  const movement = await tx.stockMovement.create({
    data: {
      materialId: m.materialId,
      locationId: m.locationId,
      lotId: m.lotId ?? null,
      type: m.type,
      quantity: m.quantity,
      unitCost: next.unitCost,
      balanceAfter: next.onHandQty,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      occurredAt: m.occurredAt,
      notes: m.notes ?? null,
      postedById: m.postedById,
    },
    select: { id: true },
  });

  return { id: movement.id, balanceAfter: next.onHandQty, unitCost: next.unitCost };
}

/** Release held stock or put stock on hold, for a lot's quality decision. */
export async function shiftStock(tx: Tx, key: BalanceKey, qty: Prisma.Decimal, to: Bucket): Promise<void> {
  const balances = await lockBalances(tx, [key]);
  const current = balances.get(keyOf(key))!;
  const next = shiftBucket(current, qty, to);
  await tx.inventoryBalance.update({ where: { id: current.id }, data: { quarantineQty: next.quarantineQty } });
}

/**
 * Refresh the material's company-wide moving average after receipts.
 * `Material.standardCost` is documented as the moving average, and the
 * stock screens value at it, so it follows every priced inflow.
 */
export async function refreshMovingAverage(tx: Tx, materialId: string): Promise<void> {
  const balances = await tx.inventoryBalance.findMany({
    where: { materialId },
    select: { onHandQty: true, valuation: true },
  });
  const avg = movingAverageCost(balances);
  if (avg !== null) await tx.material.update({ where: { id: materialId }, data: { standardCost: avg } });
}
