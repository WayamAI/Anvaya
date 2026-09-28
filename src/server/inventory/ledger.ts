import { Prisma } from "@prisma/client";
import { AppError } from "@/server/errors/app-error";

/**
 * The stock ledger — the rules, free of the database.
 *
 * Every change to stock is a signed StockMovement; InventoryBalance is a
 * cache of the ledger's running total per material and location, updated in
 * the same transaction as the movement that changes it. These functions
 * decide what the balance becomes; `stock-ledger.service.ts` locks the row
 * and writes it.
 *
 * Buckets. `onHandQty` is everything physically present. Part of it may be
 * held by quality (`quarantineQty`: lots PENDING inspection or in
 * QUARANTINE), which planning and issues cannot use. A movement says which
 * bucket it draws from or adds to; unrestricted stock is on hand minus held.
 *
 * Valuation is a moving average per balance. Receipts add at their own unit
 * cost; issues remove at the balance's current average, so an issue never
 * changes the average. When a balance empties its value is zeroed, so
 * rounding residue cannot linger as value with no stock behind it.
 *
 * Stock never goes negative. An outflow larger than the bucket it draws from
 * is refused — a negative balance in a batch-controlled plant means the
 * ledger is already wrong, and letting it through only hides where.
 */

export type Bucket = "UNRESTRICTED" | "QUARANTINE";

export interface BalanceState {
  onHandQty: Prisma.Decimal;
  quarantineQty: Prisma.Decimal;
  valuation: Prisma.Decimal;
}

export interface BalanceChange {
  /** Signed: positive into stock, negative out of it. Never zero. */
  quantity: Prisma.Decimal;
  bucket: Bucket;
  /** Required for inflows: what each unit is worth. Ignored for outflows. */
  unitCost?: Prisma.Decimal | null;
}

export interface BalanceResult extends BalanceState {
  /** Cost per unit the movement was valued at. */
  unitCost: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const QTY_DP = 6;
const VALUE_DP = 4;

export const unrestricted = (b: Pick<BalanceState, "onHandQty" | "quarantineQty">) =>
  Prisma.Decimal.max(ZERO, b.onHandQty.minus(b.quarantineQty));

/** Average cost of what is on hand, or zero when nothing is. */
export function averageCost(b: Pick<BalanceState, "onHandQty" | "valuation">): Prisma.Decimal {
  return b.onHandQty.gt(0) ? b.valuation.div(b.onHandQty).toDecimalPlaces(VALUE_DP) : ZERO;
}

export function applyMovement(balance: BalanceState, change: BalanceChange, label = "stock"): BalanceResult {
  const q = change.quantity.toDecimalPlaces(QTY_DP);
  if (q.isZero()) throw AppError.unprocessable("A stock movement cannot be for zero quantity");

  if (q.gt(0)) {
    const unitCost = change.unitCost ?? null;
    if (unitCost === null || unitCost.lt(0)) {
      throw AppError.unprocessable(`A receipt of ${label} needs a unit cost of zero or more`);
    }
    return {
      onHandQty: balance.onHandQty.plus(q),
      quarantineQty: change.bucket === "QUARANTINE" ? balance.quarantineQty.plus(q) : balance.quarantineQty,
      valuation: balance.valuation.plus(q.times(unitCost)).toDecimalPlaces(VALUE_DP),
      unitCost: unitCost.toDecimalPlaces(VALUE_DP),
    };
  }

  const out = q.negated();
  const available = change.bucket === "QUARANTINE" ? balance.quarantineQty : unrestricted(balance);
  if (out.gt(available)) {
    throw AppError.unprocessable(
      `Not enough ${change.bucket === "QUARANTINE" ? "held" : "available"} ${label}: ` +
        `${out.toString()} requested, ${available.toString()} available`,
      [{ path: "quantity", message: `exceeds available stock (${available.toString()})` }],
    );
  }

  const cost = averageCost(balance);
  const onHandQty = balance.onHandQty.minus(out);
  return {
    onHandQty,
    quarantineQty: change.bucket === "QUARANTINE" ? balance.quarantineQty.minus(out) : balance.quarantineQty,
    // Emptied → exactly zero, whatever rounding left behind.
    valuation: onHandQty.isZero()
      ? ZERO
      : Prisma.Decimal.max(ZERO, balance.valuation.minus(out.times(cost))).toDecimalPlaces(VALUE_DP),
    unitCost: cost,
  };
}

/**
 * Move quantity between buckets without it entering or leaving the plant:
 * a lot released by quality (held → unrestricted), or put on hold
 * (unrestricted → held). On-hand and value are unchanged, so no ledger row
 * is written — only the balance's split changes.
 */
export function shiftBucket(balance: BalanceState, qty: Prisma.Decimal, to: Bucket): BalanceState {
  if (qty.lte(0)) return balance;
  if (to === "UNRESTRICTED") {
    if (qty.gt(balance.quarantineQty)) {
      throw AppError.conflict(`Only ${balance.quarantineQty.toString()} is held at this location; cannot release ${qty.toString()}`);
    }
    return { ...balance, quarantineQty: balance.quarantineQty.minus(qty) };
  }
  if (qty.gt(unrestricted(balance))) {
    throw AppError.conflict(`Only ${unrestricted(balance).toString()} is unrestricted at this location; cannot hold ${qty.toString()}`);
  }
  return { ...balance, quarantineQty: balance.quarantineQty.plus(qty) };
}

/** Which bucket a lot's stock sits in, from its quality status. */
export function bucketForQc(qcStatus: string): Bucket {
  return qcStatus === "APPROVED" ? "UNRESTRICTED" : "QUARANTINE";
}

/** Company-wide moving average from every location's balance, or null when there is no stock. */
export function movingAverageCost(balances: Pick<BalanceState, "onHandQty" | "valuation">[]): Prisma.Decimal | null {
  let qty = ZERO;
  let value = ZERO;
  for (const b of balances) {
    qty = qty.plus(b.onHandQty);
    value = value.plus(b.valuation);
  }
  return qty.gt(0) ? value.div(qty).toDecimalPlaces(VALUE_DP) : null;
}
