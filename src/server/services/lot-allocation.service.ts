import { Prisma } from "@prisma/client";
import { isoDate } from "@/server/config/business-date";
import type { Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { allocateFefo, lotShippable, type CandidateLot } from "@/server/sales/so-rules";

/**
 * Which lots an outflow draws from — shared by sales dispatch and work order
 * component issue, so both apply the same rules.
 *
 * Batch-tracked material leaves from lots: the ones named (each must be
 * released, unexpired on the date, at the right material and location, and
 * hold enough), or first-expiry-first-out when none are named. Untracked
 * material leaves as one lot-less draw.
 *
 * Call after `lockBalances` for the material and location: every lot draw
 * posts to that balance, so holding its lock means the lots read here cannot
 * be drawn by anyone else before this transaction's movements are written.
 */

export interface LotDraw {
  lotId: string | null;
  lotNumber: string | null;
  quantity: Prisma.Decimal;
}

export async function resolveLotDraws(
  tx: Tx,
  opts: {
    materialId: string;
    locationId: string;
    materialCode: string;
    locationCode: string;
    isBatchTracked: boolean;
    quantity: Prisma.Decimal;
    onDate: string;
    lots?: { lotId: string; quantity: number }[];
    /** Body path of this line, e.g. "lines.2", for field-level errors. */
    path: string;
  },
  problems: ErrorDetail[],
): Promise<LotDraw[] | null> {
  const { path } = opts;

  if (!opts.isBatchTracked) {
    if (opts.lots?.length) {
      problems.push({ path: `${path}.lots`, message: `${opts.materialCode} is not batch tracked` });
      return null;
    }
    return [{ lotId: null, lotNumber: null, quantity: opts.quantity }];
  }

  const named = opts.lots?.length ? opts.lots : null;
  const candidates: CandidateLot[] = (await tx.inventoryLot.findMany({
    where: {
      materialId: opts.materialId,
      locationId: opts.locationId,
      ...(named ? { id: { in: named.map((x) => x.lotId) } } : { remainingQty: { gt: 0 }, qcStatus: "APPROVED" }),
    },
    select: { id: true, lotNumber: true, remainingQty: true, qcStatus: true, expiryDate: true, receiptDate: true },
  })).map((l) => ({ ...l, expiryDate: l.expiryDate ? isoDate(l.expiryDate) : null, receiptDate: isoDate(l.receiptDate) }));

  if (!named) {
    try {
      return allocateFefo(candidates, opts.quantity, opts.onDate, opts.materialCode);
    } catch (e) {
      if (!AppError.is(e)) throw e;
      problems.push({ path: `${path}.quantity`, message: e.message });
      return null;
    }
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const draws: LotDraw[] = [];
  const before = problems.length;
  const seen = new Set<string>();
  named.forEach((x, j) => {
    const at = `${path}.lots.${j}`;
    if (seen.has(x.lotId)) return void problems.push({ path: `${at}.lotId`, message: "appears more than once" });
    seen.add(x.lotId);
    const lot = byId.get(x.lotId);
    if (!lot) return void problems.push({ path: `${at}.lotId`, message: `is not a ${opts.materialCode} lot at ${opts.locationCode}` });
    const why = lotShippable(lot, opts.onDate);
    if (why) return void problems.push({ path: `${at}.lotId`, message: why });
    const qty = new Prisma.Decimal(x.quantity);
    if (qty.gt(lot.remainingQty)) return void problems.push({ path: `${at}.quantity`, message: `lot ${lot.lotNumber} has ${lot.remainingQty} remaining` });
    draws.push({ lotId: lot.id, lotNumber: lot.lotNumber, quantity: qty });
  });
  return problems.length > before ? null : draws;
}
