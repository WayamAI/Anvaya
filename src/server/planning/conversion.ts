import { maxDate } from "./dates";

/**
 * Planned purchases → draft purchase orders, keeping the plan's timing.
 *
 * One PO line per planned order, due on that order's required date (moved to
 * today when already past). Orders are never summed: 100 needed on the 5th
 * and 100 on the 15th stay two lines, not 200 on the 5th, and the separate
 * orders a maximum order quantity split a requirement into stay separate.
 *
 * Planned orders for one vendor and delivery location share a PO. A PO holds
 * a material once per date (`duplicateLineProblems`), so when two orders for
 * the same material fall on the same date — maximum-quantity splits, or
 * past-due orders both moved to today — the second goes on another PO to the
 * same vendor. The order of everything is deterministic.
 */

export interface PurchasePlanned {
  id: string;
  materialId: string;
  /** For a stable order between materials. */
  materialCode: string;
  vendorId: string;
  locationId: string;
  quantity: number;
  /** ISO date the quantity is needed. */
  requiredDate: string;
}

export interface DraftPurchaseOrder {
  vendorId: string;
  locationId: string;
  lines: { plannedOrderId: string; materialId: string; orderedQty: number; expectedDeliveryDate: string }[];
}

export function draftPurchaseOrders(orders: PurchasePlanned[], today: string): DraftPurchaseOrder[] {
  const dated = orders
    .map((o) => ({ ...o, date: maxDate(o.requiredDate, today) }))
    .sort((a, b) =>
      a.vendorId.localeCompare(b.vendorId) || a.locationId.localeCompare(b.locationId) ||
      a.date.localeCompare(b.date) || a.materialCode.localeCompare(b.materialCode) || a.id.localeCompare(b.id));

  const drafts: (DraftPurchaseOrder & { taken: Set<string> })[] = [];
  for (const o of dated) {
    const slot = `${o.materialId}|${o.date}`;
    let draft = drafts.find((d) => d.vendorId === o.vendorId && d.locationId === o.locationId && !d.taken.has(slot));
    if (!draft) {
      draft = { vendorId: o.vendorId, locationId: o.locationId, lines: [], taken: new Set() };
      drafts.push(draft);
    }
    draft.taken.add(slot);
    draft.lines.push({ plannedOrderId: o.id, materialId: o.materialId, orderedQty: o.quantity, expectedDeliveryDate: o.date });
  }
  return drafts.map(({ taken: _taken, ...d }) => d);
}
