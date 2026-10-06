import { z } from "zod";
import { CustomerType, LocationType, LotSizingRule, MaterialKind, ProcurementType } from "@prisma/client";
import { id, nonNegativeQty, optionalText, price, text } from "./common";

/** Request bodies for master data: materials, policies, vendors, customers, locations, settings. */

const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/, "use up to 40 letters, digits, '.', '_' or '-'");
const nullableText = (max: number) => text(max).nullable().optional().transform((v) => (v === "" ? null : v));
const email = z.string().trim().toLowerCase().email().max(254);
const days = z.number().int().min(0).max(3650);
const nonEmpty = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict().refine((b) => Object.keys(b).length > 0, "send at least one field to change");

/* ---- Materials ------------------------------------------------------------- */

export const createMaterialBody = z.object({
  code,
  name: text(200).min(1),
  description: optionalText(2000),
  kind: z.nativeEnum(MaterialKind),
  categoryId: id.optional(),
  unitOfMeasureId: id,
  standardCost: price.optional(),
  shelfLifeDays: days.optional(),
  isBatchTracked: z.boolean().default(false),
}).strict();
export type CreateMaterialInput = z.infer<typeof createMaterialBody>;

export const updateMaterialBody = nonEmpty({
  name: text(200).min(1).optional(),
  description: nullableText(2000),
  kind: z.nativeEnum(MaterialKind).optional(),
  categoryId: id.nullable().optional(),
  unitOfMeasureId: id.optional(),
  standardCost: price.optional(),
  shelfLifeDays: days.nullable().optional(),
  isBatchTracked: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMaterialInput = z.infer<typeof updateMaterialBody>;

/** PUT /api/v1/materials/:id/policies/:locationId — the whole policy, as MRP reads it. */
export const policyBody = z.object({
  procurementType: z.nativeEnum(ProcurementType),
  safetyStock: nonNegativeQty.default(0),
  reorderPoint: nonNegativeQty.default(0),
  lotSizingRule: z.nativeEnum(LotSizingRule).default("LOT_FOR_LOT"),
  minOrderQty: nonNegativeQty.default(0),
  maxOrderQty: nonNegativeQty.nullable().default(null),
  orderMultiple: nonNegativeQty.default(0),
  periodDays: z.number().int().min(1).max(365).nullable().default(null),
  productionLeadTimeDays: days.default(0),
  safetyLeadTimeDays: days.default(0),
  averageDailyDemand: nonNegativeQty.nullable().default(null),
  demandStdDev: nonNegativeQty.nullable().default(null),
  serviceLevel: z.number().gt(0).lt(1).nullable().default(null),
  abcClass: z.enum(["A", "B", "C"]).nullable().default(null),
  isActive: z.boolean().default(true),
}).strict().superRefine((p, ctx) => {
  if (p.maxOrderQty !== null && p.maxOrderQty < p.minOrderQty) {
    ctx.addIssue({ code: "custom", path: ["maxOrderQty"], message: "cannot be below the minimum order quantity" });
  }
  if (p.maxOrderQty !== null && p.maxOrderQty > 0 && p.orderMultiple > 0 && p.maxOrderQty < p.orderMultiple) {
    ctx.addIssue({ code: "custom", path: ["maxOrderQty"], message: "cannot be below the order multiple" });
  }
  if (p.reorderPoint < p.safetyStock) {
    ctx.addIssue({ code: "custom", path: ["reorderPoint"], message: "cannot be below safety stock" });
  }
  if (p.lotSizingRule === "PERIOD_ORDER_QTY" && p.periodDays === null) {
    ctx.addIssue({ code: "custom", path: ["periodDays"], message: "is required for period order quantity" });
  }
});
export type PolicyInput = z.infer<typeof policyBody>;

export const createCategoryBody = z.object({
  code, name: text(100).min(1), parentId: id.optional(),
}).strict();
export type CreateCategoryInput = z.infer<typeof createCategoryBody>;

export const createUnitBody = z.object({
  code, name: text(50).min(1), dimension: z.enum(["MASS", "VOLUME", "COUNT", "LENGTH", "AREA", "TIME"]),
}).strict();
export type CreateUnitInput = z.infer<typeof createUnitBody>;

/* ---- Vendors ------------------------------------------------------------------ */

const vendorFields = {
  vendorCode: nullableText(40),
  name: text(200).min(1),
  contactPerson: nullableText(100),
  contactEmail: email.nullable().optional(),
  contactPhone: nullableText(40),
  addressLine1: nullableText(200),
  city: nullableText(100),
  state: nullableText(100),
  country: nullableText(2),
  paymentTerms: nullableText(100),
};

export const createVendorBody = z.object({ code, ...vendorFields, isApproved: z.boolean().default(false) }).strict();
export type CreateVendorInput = z.infer<typeof createVendorBody>;

export const updateVendorBody = nonEmpty({
  ...Object.fromEntries(Object.entries(vendorFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as {
    [K in keyof typeof vendorFields]: z.ZodOptional<(typeof vendorFields)[K]>;
  },
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateVendorInput = z.infer<typeof updateVendorBody>;

/** PUT /api/v1/vendors/:id/materials/:materialId */
export const vendorMaterialBody = z.object({
  leadTimeDays: days,
  unitPrice: price.nullable().default(null),
  minOrderQty: nonNegativeQty.default(0),
  orderMultiple: nonNegativeQty.default(0),
  isPreferred: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).strict();
export type VendorMaterialInput = z.infer<typeof vendorMaterialBody>;

/* ---- Customers and locations --------------------------------------------------- */

const customerFields = {
  name: text(200).min(1),
  type: z.nativeEnum(CustomerType),
  contactPerson: nullableText(100),
  contactEmail: email.nullable().optional(),
  contactPhone: nullableText(40),
  city: nullableText(100),
  state: nullableText(100),
  country: nullableText(2),
  paymentTerms: nullableText(100),
};

export const createCustomerBody = z.object({ code, ...customerFields, type: z.nativeEnum(CustomerType).default("DISTRIBUTOR") }).strict();
export type CreateCustomerInput = z.infer<typeof createCustomerBody>;

export const updateCustomerBody = nonEmpty({
  ...Object.fromEntries(Object.entries(customerFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as {
    [K in keyof typeof customerFields]: z.ZodOptional<(typeof customerFields)[K]>;
  },
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerBody>;

export const createLocationBody = z.object({
  code, name: text(100).min(1), type: z.nativeEnum(LocationType),
  city: nullableText(100), state: nullableText(100), country: nullableText(2),
  isManufacturing: z.boolean().default(false),
}).strict();
export type CreateLocationInput = z.infer<typeof createLocationBody>;

export const updateLocationBody = nonEmpty({
  name: text(100).min(1).optional(), type: z.nativeEnum(LocationType).optional(),
  city: nullableText(100), state: nullableText(100), country: nullableText(2),
  isManufacturing: z.boolean().optional(), isActive: z.boolean().optional(),
});
export type UpdateLocationInput = z.infer<typeof updateLocationBody>;

/* ---- Company settings -------------------------------------------------------------- */

const pct = z.number().min(0).max(100);
export const updateSettingsBody = nonEmpty({
  "purchasing.overReceiptTolerancePct": pct.optional(),
  "mrp.rescheduleInToleranceDays": z.number().int().min(0).max(90).optional(),
  "purchasing.allowSelfApproval": z.boolean().optional(),
  "sales.overDispatchTolerancePct": pct.optional(),
  "production.overProductionTolerancePct": pct.optional(),
  "production.overIssueTolerancePct": pct.optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsBody>;
