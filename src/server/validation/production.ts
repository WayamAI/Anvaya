import { z } from "zod";
import { WORK_ORDER_STATUSES } from "@/server/production/work-orders";
import { id, isoDate, listOrdersQuery, nonNegativeQty, optionalText, qty, reason, text } from "./common";

/** GET /api/v1/work-orders */
export const listWorkOrdersQuery = listOrdersQuery(WORK_ORDER_STATUSES);

/** Request bodies for work orders. Shape and range only. */

const operation = z.object({
  name: text(100).min(1),
  workCentre: optionalText(100),
  setupMinutes: z.number().finite().min(0).max(100_000).default(0),
  runMinutes: z.number().finite().min(0).max(1_000_000).default(0),
});

/** POST /api/v1/work-orders */
export const createWorkOrderBody = z.object({
  materialId: id,
  locationId: id,
  plannedQty: qty,
  plannedStartDate: isoDate,
  plannedEndDate: isoDate,
  /** Omitted → the product's active BOM version. */
  bomVersionId: id.optional(),
  priority: z.number().int().min(0).max(100).optional(),
  notes: optionalText(2000),
  /** Routing, in order. Omitted → no operations recorded. */
  operations: z.array(operation).max(50).optional(),
}).strict();

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderBody>;

/** PATCH /api/v1/work-orders/:id — PLANNED or FIRMED. */
export const updateWorkOrderBody = z.object({
  plannedQty: qty.optional(),
  plannedStartDate: isoDate.optional(),
  plannedEndDate: isoDate.optional(),
  priority: z.number().int().min(0).max(100).optional(),
  notes: text(2000).nullable().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderBody>;

/** POST /api/v1/work-orders/:id/issues */
export const issueBody = z.object({
  issueDate: isoDate.optional(),
  lines: z.array(z.object({
    /** The component material. */
    materialId: id,
    quantity: qty,
    /** Batch-tracked components: omitted → first-expiry-first-out from released lots. */
    lots: z.array(z.object({ lotId: id, quantity: qty })).max(50).optional(),
  })).min(1, "an issue needs at least one line").max(200),
}).strict();

export type IssueInput = z.infer<typeof issueBody>;

/** POST /api/v1/work-orders/:id/output */
export const outputBody = z.object({
  /** Good output into stock. May be 0 when only reporting scrap or completing. */
  quantity: nonNegativeQty,
  scrappedQty: nonNegativeQty.optional(),
  producedDate: isoDate.optional(),
  /** Batch-tracked product: omitted → produced date + shelf life. */
  expiryDate: isoDate.optional(),
  /** Batch-tracked product: omitted → PENDING, held until quality releases it. */
  qcStatus: z.enum(["PENDING", "APPROVED", "QUARANTINE"]).optional(),
  storageLocation: optionalText(100),
  bin: optionalText(50),
  /** Mark the order COMPLETED with this report. */
  complete: z.boolean().optional(),
  /**
   * Complete although components are issued short of the output: needs
   * `work-order:complete-short`, and is recorded in the audit trail.
   */
  shortIssueReason: reason.optional(),
}).strict().refine((b) => b.quantity > 0 || (b.scrappedQty ?? 0) > 0 || b.complete, {
  path: ["quantity"], message: "report some output or scrap, or complete the order",
});

export type OutputInput = z.infer<typeof outputBody>;

/** POST /api/v1/work-orders/:id/complete — the body is optional. */
export const completeWorkOrderBody = z.object({
  /** See `outputBody.shortIssueReason`. */
  shortIssueReason: reason.optional(),
}).strict();
export type CompleteWorkOrderInput = z.infer<typeof completeWorkOrderBody>;

export const cancelWorkOrderBody = z.object({ reason }).strict();
export type CancelWorkOrderInput = z.infer<typeof cancelWorkOrderBody>;
