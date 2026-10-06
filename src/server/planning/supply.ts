import { r6 } from "./dates";

/**
 * Stock MRP may plan with, per material and location.
 *
 * On hand, less what quality holds (lots pending inspection or quarantined,
 * the balance's quarantineQty), less released lots that expired before the
 * planning date. Expired stock stays on the books until someone writes it
 * off, but dispatch and component issue refuse it (`lotShippable`), so
 * counting it as supply would plan a shortage as covered. A lot expiring on
 * the planning date itself is still usable that day, as it is for dispatch.
 */

export interface BalanceQty {
  materialId: string;
  locationId: string;
  onHandQty: number;
  quarantineQty: number;
}

export interface ExpiredLotQty {
  materialId: string;
  locationId: string;
  remainingQty: number;
}

const key = (m: string, l: string) => `${m}|${l}`;

export function usableStock(balances: BalanceQty[], expiredReleasedLots: ExpiredLotQty[]) {
  const expired = new Map<string, number>();
  for (const l of expiredReleasedLots) {
    const k = key(l.materialId, l.locationId);
    expired.set(k, (expired.get(k) ?? 0) + l.remainingQty);
  }
  return balances
    .map((b) => ({
      materialId: b.materialId,
      locationId: b.locationId,
      qty: r6(Math.max(0, b.onHandQty - b.quarantineQty - (expired.get(key(b.materialId, b.locationId)) ?? 0))),
    }))
    .filter((b) => b.qty > 0);
}
