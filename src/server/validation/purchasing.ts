import { z } from "zod";
import { id, isoDate, nonNegativeQty, optionalText, price, qty, reason, text } from "./common";

/**
 * Request bodies for purchase orders, goods receipts and lot quality
 * decisions. Shape and range only — whether a vendor exists, a line is
 * receivable or a quantity fits is the service's call, against the database.
 */

const poLine = z.object({
  materialId: id,
  orderedQty: qty,
  /** Omitted → the vendor's price for the material, if one is on file. */
  unitPrice: price.optional(),
  /** Omitted → the PO's expected delivery date. */
  expectedDeliveryDate: isoDate.optional(),
});

const lines = z.array(poLine).min(1, "a purchase order needs at least one line").max(200)
  .superRefine((ls, ctx) => {
    const seen = new Set<string>();
    ls.forEach((l, i) => {
      if (seen.has(l.materialId)) {
        ctx.addIssue({ code: "custom", path: [i, "materialId"], message: "appears on more than one line; combine the quantities" });
      }
      seen.add(l.materialId);
    });
  });

/** POST /api/v1/purchase-orders */
export const createPurchaseOrderBody = z.object({
  vendorId: id,
  locationId: id,
  /** Omitted → today in the company's time zone. */
  orderDate: isoDate.optional(),
  expectedDeliveryDate: isoDate,
  notes: optionalText(2000),
  lines,
}).strict();

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderBody>;

/** PATCH /api/v1/purchase-orders/:id — DRAFT only. `lines`, when sent, replaces them all. */
export const updatePurchaseOrderBody = z.object({
  vendorId: id.optional(),
  locationId: id.optional(),
  orderDate: isoDate.optional(),
  expectedDeliveryDate: isoDate.optional(),
  notes: text(2000).nullable().optional(),
  lines: lines.optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderBody>;

/** POST /api/v1/purchase-orders/:id/cancel */
export const cancelPurchaseOrderBody = z.object({
  reason,
}).strict();

export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderBody>;

const receiptLine = z.object({
  purchaseOrderLineId: id,
  /** Accepted into stock. */
  receivedQty: nonNegativeQty,
  /** Refused at the dock; recorded, never stocked. */
  rejectedQty: nonNegativeQty.optional(),
  supplierLotNumber: optionalText(100),
  coaReference: optionalText(100),
  inspectionStatus: z.enum(["PENDING", "APPROVED", "QUARANTINE"]).optional(),
  inspectorName: optionalText(100),
  /** Omitted → receipt date + the material's shelf life, where it has one. */
  expiryDate: isoDate.optional(),
  storageLocation: optionalText(100),
  bin: optionalText(50),
});

/** POST /api/v1/goods-receipts */
export const createGoodsReceiptBody = z.object({
  purchaseOrderId: id,
  /** Omitted → today in the company's time zone. */
  receiptDate: isoDate.optional(),
  notes: optionalText(2000),
  lines: z.array(receiptLine).min(1, "a receipt needs at least one line").max(200),
}).strict();

export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptBody>;

/** POST /api/v1/inventory/lots/:id/qc */
export const lotQcBody = z.object({
  status: z.enum(["APPROVED", "QUARANTINE", "REJECTED"]),
  coaReference: optionalText(100),
  /** Required for QUARANTINE and REJECTED: the trail must say why. */
  reason: optionalText(500),
}).strict().refine((b) => b.status === "APPROVED" || !!b.reason, {
  path: ["reason"], message: "is required when holding or rejecting a lot",
});

export type LotQcInput = z.infer<typeof lotQcBody>;

/** GET /api/v1/vendors */
export const listVendorsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  /** Only vendors that supply this material. */
  materialId: id.optional(),
});

export type ListVendorsQuery = z.infer<typeof listVendorsQuery>;
