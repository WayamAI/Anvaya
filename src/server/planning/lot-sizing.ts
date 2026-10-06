import { r6 } from "./dates";

/**
 * Lot sizing: turn a net requirement into order quantities.
 *
 * | Rule              | Quantity                                                     |
 * |-------------------|--------------------------------------------------------------|
 * | LOT_FOR_LOT       | exactly the net requirement                                  |
 * | FIXED_ORDER_QTY   | whole multiples of the fixed quantity (`minOrderQty`)        |
 * | MIN_ORDER_QTY     | the net requirement, raised to the minimum                   |
 * | PERIOD_ORDER_QTY  | the requirement of the whole period (the caller looks ahead) |
 *
 * Then, whatever the rule, the quantity is rounded up to the order multiple
 * and, if above the maximum order quantity, split into several orders no
 * larger than the maximum (each still a whole multiple where one is set).
 */

export type LotSizingRule = "LOT_FOR_LOT" | "FIXED_ORDER_QTY" | "MIN_ORDER_QTY" | "PERIOD_ORDER_QTY";

export interface LotSizing {
  rule: LotSizingRule;
  minOrderQty: number;
  orderMultiple: number;
  maxOrderQty: number | null;
}

const roundUpTo = (q: number, multiple: number) => (multiple > 0 ? r6(Math.ceil(r6(q / multiple) - 1e-9) * multiple) : r6(q));
const roundDownTo = (q: number, multiple: number) => (multiple > 0 ? r6(Math.floor(r6(q / multiple) + 1e-9) * multiple) : r6(q));

export function sizeLot(net: number, s: LotSizing): number[] {
  if (net <= 0) return [];
  let total: number;
  switch (s.rule) {
    case "FIXED_ORDER_QTY": {
      const fixed = s.minOrderQty > 0 ? s.minOrderQty : net;
      total = r6(Math.ceil(r6(net / fixed) - 1e-9) * fixed);
      break;
    }
    case "MIN_ORDER_QTY":
    case "PERIOD_ORDER_QTY":
      total = Math.max(net, s.minOrderQty);
      break;
    default:
      total = net;
  }
  total = roundUpTo(total, s.orderMultiple);

  if (s.maxOrderQty === null || s.maxOrderQty <= 0 || total <= s.maxOrderQty) return [total];
  // Largest order the maximum allows, kept a whole multiple. When the maximum
  // is below one multiple no order can honour both; the multiple is what the
  // vendor ships, so it wins and each order is a single multiple. Falling
  // back to the raw maximum instead would round every chunk up to a multiple
  // and multiply the total (see `lotSizingConflict`, which the engine reports).
  const chunk = roundDownTo(s.maxOrderQty, s.orderMultiple) || (s.orderMultiple > 0 ? s.orderMultiple : s.maxOrderQty);
  const orders: number[] = [];
  let left = total;
  while (left > 1e-9) {
    const q = r6(Math.min(chunk, left));
    orders.push(roundUpTo(q, s.orderMultiple));
    left = r6(left - q);
  }
  return orders;
}

/**
 * Why the rules cannot all be honoured, or null when they can. The policy
 * screen refuses this combination, but the multiple may come from the
 * vendor record, which the policy cannot be checked against when it is saved.
 */
export function lotSizingConflict(s: LotSizing): string | null {
  if (s.maxOrderQty === null || s.maxOrderQty <= 0 || s.orderMultiple <= 0) return null;
  if (roundDownTo(s.maxOrderQty, s.orderMultiple) > 0) return null;
  return `maximum order quantity ${s.maxOrderQty} is below the order multiple ${s.orderMultiple}`;
}
