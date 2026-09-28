import { z } from "zod";
import { id, isoDate, optionalText, price, qty, reason, text } from "./common";

/**
 * Request bodies for sales orders and dispatch. Shape and range only; the
 * services check references, stock and lifecycle against the database.
 */

const soLine = z.object({
  materialId: id,
  /** Omitted → the order's `locationId`. */
  locationId: id.optional(),
  quantity: qty,
  unitPrice: price,
  /** Omitted → the order's required date. */
  requiredDate: isoDate.optional(),
});

const lines = z.array(soLine).min(1, "a sales order needs at least one line").max(200)
  .superRefine((ls, ctx) => {
    const seen = new Set<string>();
    ls.forEach((l, i) => {
      const key = `${l.materialId}|${l.locationId ?? ""}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [i, "materialId"], message: "appears on more than one line for the same location" });
      seen.add(key);
    });
  });

/** POST /api/v1/sales-orders */
export const createSalesOrderBody = z.object({
  customerId: id,
  /** Default ship-from location for lines that do not name one. */
  locationId: id.optional(),
  orderDate: isoDate.optional(),
  requiredDate: isoDate,
  notes: optionalText(2000),
  lines,
}).strict();

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderBody>;

/** PATCH /api/v1/sales-orders/:id — CONFIRMED with nothing shipped. */
export const updateSalesOrderBody = z.object({
  customerId: id.optional(),
  locationId: id.optional(),
  orderDate: isoDate.optional(),
  requiredDate: isoDate.optional(),
  notes: text(2000).nullable().optional(),
  lines: lines.optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

export type UpdateSalesOrderInput = z.infer<typeof updateSalesOrderBody>;

export const cancelSalesOrderBody = z.object({
  reason,
}).strict();

export type CancelSalesOrderInput = z.infer<typeof cancelSalesOrderBody>;

/** POST /api/v1/sales-orders/:id/dispatches */
export const dispatchBody = z.object({
  /** Omitted → today in the company's time zone. */
  dispatchDate: isoDate.optional(),
  invoiceNumber: optionalText(50),
  notes: optionalText(500),
  lines: z.array(z.object({
    salesOrderLineId: id,
    quantity: qty,
    /** Batch-tracked materials: omitted → allocated first-expiry-first-out. */
    lots: z.array(z.object({ lotId: id, quantity: qty })).max(50).optional(),
  })).min(1, "a dispatch needs at least one line").max(200),
}).strict();

export type DispatchInput = z.infer<typeof dispatchBody>;

/** POST /api/v1/sales-orders/:id/deliver */
export const deliverBody = z.object({
  deliveredDate: isoDate.optional(),
}).strict();

export type DeliverInput = z.infer<typeof deliverBody>;

/** GET /api/v1/customers */
export const listCustomersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
