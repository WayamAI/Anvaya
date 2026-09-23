/**
 * Normalised master data for the demo company.
 *
 * Derived from the static arrays the frontend shipped with
 * (src/views/StockOverview.tsx, SafetyStock.tsx, BOMManagement.tsx and
 * src/data/*.ts) but deliberately not copied verbatim: presentation values
 * such as "4,200 kg", "₹4.92 L" and "280 kg/d" are split into a number and a
 * unit here, because a database column that stores "₹4.92 L" cannot be summed,
 * compared or planned against.
 */

import { MaterialKind, ProcurementType, LotSizingRule, LocationType, CustomerType } from "@prisma/client";

export const COMPANY = {
  code: "ANVAYA",
  name: "Anvaya Chemicals",
  legalName: "Anvaya Chemicals Private Limited",
  currencyCode: "INR",
  timezone: "Asia/Kolkata",
  city: "Pune",
  state: "Maharashtra",
  country: "IN",
} as const;

export const LOCATIONS = [
  { code: "PUNE", name: "Pune Plant", type: LocationType.PLANT, city: "Pune", state: "Maharashtra", isManufacturing: true },
  { code: "MUMBAI", name: "Mumbai Warehouse", type: LocationType.WAREHOUSE, city: "Mumbai", state: "Maharashtra", isManufacturing: false },
  { code: "CHENNAI", name: "Chennai Hub", type: LocationType.HUB, city: "Chennai", state: "Tamil Nadu", isManufacturing: false },
  { code: "DELHI", name: "Delhi Depot", type: LocationType.DEPOT, city: "New Delhi", state: "Delhi", isManufacturing: false },
] as const;

/** Stocking units. `dimension` gates which conversions are ever legal. */
export const UNITS = [
  { code: "KG", name: "Kilogram", dimension: "MASS" },
  { code: "L", name: "Litre", dimension: "VOLUME" },
  { code: "PCS", name: "Pieces", dimension: "COUNT" },
  { code: "UNIT", name: "Unit", dimension: "COUNT" },
] as const;

/**
 * Two tiers: a broad parent per material role, and the specific categories the
 * Stock Overview screen already shows ("Polymer", "Chemical", "Pigment"...).
 */
export const CATEGORY_PARENTS = [
  { code: "RAW", name: "Raw material" },
  { code: "PACK", name: "Packaging material" },
  { code: "PROD", name: "Production output" },
] as const;

export const CATEGORIES = [
  { code: "POLYMER", name: "Polymer", parent: "RAW" },
  { code: "CHEMICAL", name: "Chemical", parent: "RAW" },
  { code: "PIGMENT", name: "Pigment", parent: "RAW" },
  { code: "UTILITY", name: "Utility", parent: "RAW" },
  { code: "FRAGRANCE", name: "Fragrance", parent: "RAW" },
  { code: "SOLVENT", name: "Solvent", parent: "RAW" },
  { code: "ESSOIL", name: "Essential Oil", parent: "RAW" },
  { code: "PACKAGING", name: "Packaging", parent: "PACK" },
  { code: "SEMI", name: "Semi-finished", parent: "PROD" },
  { code: "FINISHED", name: "Finished goods", parent: "PROD" },
] as const;

export interface SeedMaterial {
  code: string;
  name: string;
  kind: MaterialKind;
  category: string;
  uom: string;
  /** Per stocking unit, in INR. From the `avgCost` column of Stock Overview. */
  standardCost: number;
  shelfLifeDays?: number;
  isBatchTracked: boolean;
}

/**
 * The item master.
 *
 * The twenty purchased materials come from Stock Overview, with `avgCost`
 * taken as the standard cost. SA-101 and the finished goods come from the BOM
 * tree and the product list on the BOM Management screen.
 */
export const MATERIALS: SeedMaterial[] = [
  // --- Raw materials ---
  { code: "RM-1042", name: "Polypropylene Granules", kind: MaterialKind.RAW, category: "POLYMER", uom: "KG", standardCost: 82, isBatchTracked: true },
  { code: "RM-2087", name: "Stearic Acid", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 145, shelfLifeDays: 730, isBatchTracked: true },
  { code: "RM-3011", name: "HDPE Resin", kind: MaterialKind.RAW, category: "POLYMER", uom: "KG", standardCost: 78, isBatchTracked: true },
  { code: "RM-4023", name: "Sodium Lauryl Sulphate", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 185, shelfLifeDays: 730, isBatchTracked: true },
  { code: "RM-5018", name: "EDTA Disodium Salt", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 420, shelfLifeDays: 1095, isBatchTracked: true },
  { code: "RM-6031", name: "Titanium Dioxide", kind: MaterialKind.RAW, category: "PIGMENT", uom: "KG", standardCost: 320, isBatchTracked: true },
  { code: "RM-7044", name: "Demineralised Water", kind: MaterialKind.RAW, category: "UTILITY", uom: "L", standardCost: 2, isBatchTracked: false },
  { code: "RM-8012", name: "Fragrance Blend FG-04", kind: MaterialKind.RAW, category: "FRAGRANCE", uom: "L", standardCost: 2800, shelfLifeDays: 365, isBatchTracked: true },
  { code: "RM-9055", name: "Caustic Soda Flakes", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 38, shelfLifeDays: 730, isBatchTracked: true },
  { code: "RM-1066", name: "Citric Acid Monohydrate", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 110, shelfLifeDays: 1095, isBatchTracked: true },
  { code: "RM-1177", name: "Isopropyl Alcohol", kind: MaterialKind.RAW, category: "SOLVENT", uom: "L", standardCost: 95, shelfLifeDays: 730, isBatchTracked: true },
  { code: "RM-2101", name: "Coconut Diethanolamide", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "KG", standardCost: 240, shelfLifeDays: 545, isBatchTracked: true },
  { code: "RM-2205", name: "Glycerine IP", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "L", standardCost: 85, shelfLifeDays: 1095, isBatchTracked: true },
  { code: "RM-3310", name: "Sodium Hypochlorite", kind: MaterialKind.RAW, category: "CHEMICAL", uom: "L", standardCost: 22, shelfLifeDays: 180, isBatchTracked: true },
  { code: "RM-4401", name: "Pine Oil", kind: MaterialKind.RAW, category: "ESSOIL", uom: "L", standardCost: 650, shelfLifeDays: 730, isBatchTracked: true },

  // --- Packaging ---
  { code: "PM-1001", name: "HDPE Bottle 5L", kind: MaterialKind.PACKAGING, category: "PACKAGING", uom: "PCS", standardCost: 42, isBatchTracked: true },
  { code: "PM-1002", name: "Shrink Labels (Type A)", kind: MaterialKind.PACKAGING, category: "PACKAGING", uom: "PCS", standardCost: 3.5, isBatchTracked: true },
  { code: "PM-2003", name: "Foil Seals 5L", kind: MaterialKind.PACKAGING, category: "PACKAGING", uom: "PCS", standardCost: 1.8, isBatchTracked: true },
  { code: "PM-2008", name: "Shrink Labels (Type B)", kind: MaterialKind.PACKAGING, category: "PACKAGING", uom: "PCS", standardCost: 3.2, isBatchTracked: true },
  { code: "PM-3004", name: "Corrugated Cartons (5Lx6)", kind: MaterialKind.PACKAGING, category: "PACKAGING", uom: "PCS", standardCost: 28, isBatchTracked: false },

  // --- Semi-finished: the intermediate that makes the BOM multi-level ---
  { code: "SA-101", name: "Concentrate Base", kind: MaterialKind.SEMI_FINISHED, category: "SEMI", uom: "L", standardCost: 196, shelfLifeDays: 180, isBatchTracked: true },

  // --- Finished goods ---
  { code: "FG-001", name: "Industrial Cleaning Compound 5L", kind: MaterialKind.FINISHED, category: "FINISHED", uom: "UNIT", standardCost: 690, shelfLifeDays: 730, isBatchTracked: true },
  { code: "FG-002", name: "Floor Polish 1L", kind: MaterialKind.FINISHED, category: "FINISHED", uom: "UNIT", standardCost: 210, shelfLifeDays: 730, isBatchTracked: true },
  { code: "FG-003", name: "Dish Wash Liquid 500ml", kind: MaterialKind.FINISHED, category: "FINISHED", uom: "UNIT", standardCost: 95, shelfLifeDays: 545, isBatchTracked: true },
  { code: "FG-004", name: "Glass Cleaner 1L", kind: MaterialKind.FINISHED, category: "FINISHED", uom: "UNIT", standardCost: 130, shelfLifeDays: 545, isBatchTracked: true },
  { code: "FG-005", name: "Surface Disinfectant 5L", kind: MaterialKind.FINISHED, category: "FINISHED", uom: "UNIT", standardCost: 640, shelfLifeDays: 545, isBatchTracked: true },
];

/**
 * The BOM for FG-001, exactly as the BOM Management screen draws it.
 *
 * Three levels: FG-001 -> SA-101 -> four raw materials, with packaging and
 * fragrance attaching at level 1. This is the structure the MRP engine's
 * multi-level explosion is tested against.
 */
export const BOM_FG001 = {
  code: "BOM-FG-001",
  name: "Industrial Cleaning Compound 5L",
  material: "FG-001",
  version: "A",
  baseQuantity: 1,
  components: [
    { material: "SA-101", quantity: 2.5, uom: "L", scrapFactor: 0.02 },
    { material: "RM-8012", quantity: 0.05, uom: "L", scrapFactor: 0.01 },
    { material: "PM-1001", quantity: 1, uom: "PCS", scrapFactor: 0.01 },
    { material: "PM-2003", quantity: 1, uom: "PCS", scrapFactor: 0.01 },
    { material: "PM-1002", quantity: 1, uom: "PCS", scrapFactor: 0.02 },
    { material: "PM-3004", quantity: 0.1667, uom: "PCS", scrapFactor: 0 },
  ],
};

/** Level 2: the concentrate the finished product is built from. */
export const BOM_SA101 = {
  code: "BOM-SA-101",
  name: "Concentrate Base",
  material: "SA-101",
  version: "A",
  /** Components below yield 100 L of concentrate; per-litre is derived. */
  baseQuantity: 100,
  components: [
    { material: "RM-4023", quantity: 32, uom: "KG", scrapFactor: 0.02 },
    { material: "RM-5018", quantity: 4.8, uom: "KG", scrapFactor: 0.01 },
    { material: "RM-7044", quantity: 72, uom: "L", scrapFactor: 0 },
    { material: "RM-2087", quantity: 6, uom: "KG", scrapFactor: 0.02 },
  ],
};

export interface SeedPolicy {
  material: string;
  location: string;
  procurementType: ProcurementType;
  safetyStock: number;
  reorderPoint: number;
  lotSizingRule: LotSizingRule;
  minOrderQty: number;
  orderMultiple: number;
  productionLeadTimeDays: number;
  /** From the Safety Stock screen's "avgDaily" column, unit stripped. */
  averageDailyDemand?: number;
  /** From "stdDev", unit stripped. */
  demandStdDev?: number;
  serviceLevel?: number;
  abcClass?: string;
}

/**
 * Planning policy at the Pune plant.
 *
 * Safety stock and reorder points are the numbers the Safety Stock and Stock
 * Overview screens already display, with "500 kg" reduced to 500 and the unit
 * carried by the material's stocking UoM instead. Demand mean and standard
 * deviation are kept so the statistical recommendation
 * (SS = Z x stdDev x sqrt(leadTime)) can be recomputed rather than hardcoded.
 */
export const POLICIES_PUNE: SeedPolicy[] = [
  { material: "RM-1042", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 500, reorderPoint: 3000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 500, orderMultiple: 100, productionLeadTimeDays: 0, averageDailyDemand: 280, demandStdDev: 45, serviceLevel: 0.95, abcClass: "A" },
  { material: "RM-2087", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 100, reorderPoint: 500, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 200, orderMultiple: 50, productionLeadTimeDays: 0, averageDailyDemand: 42, demandStdDev: 18, serviceLevel: 0.95, abcClass: "B" },
  { material: "RM-3011", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 800, reorderPoint: 4000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 500, orderMultiple: 100, productionLeadTimeDays: 0, averageDailyDemand: 310, demandStdDev: 28, serviceLevel: 0.95, abcClass: "A" },
  { material: "RM-4023", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 200, reorderPoint: 800, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 0, averageDailyDemand: 42, demandStdDev: 12, serviceLevel: 0.95, abcClass: "A" },
  { material: "RM-5018", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 50, reorderPoint: 200, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 50, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 18, demandStdDev: 6, serviceLevel: 0.95, abcClass: "B" },
  { material: "RM-6031", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 150, reorderPoint: 500, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 78, demandStdDev: 22, serviceLevel: 0.95, abcClass: "B" },
  { material: "RM-7044", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 2000, reorderPoint: 5000, lotSizingRule: LotSizingRule.LOT_FOR_LOT, minOrderQty: 0, orderMultiple: 0, productionLeadTimeDays: 0, averageDailyDemand: 620, demandStdDev: 80, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-8012", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 10, reorderPoint: 40, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 20, orderMultiple: 5, productionLeadTimeDays: 0, averageDailyDemand: 6, demandStdDev: 2, serviceLevel: 0.98, abcClass: "A" },
  { material: "RM-9055", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 300, reorderPoint: 1200, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 250, orderMultiple: 50, productionLeadTimeDays: 0, averageDailyDemand: 95, demandStdDev: 15, serviceLevel: 0.95, abcClass: "B" },
  { material: "RM-1066", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 80, reorderPoint: 300, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 22, demandStdDev: 8, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-1177", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 100, reorderPoint: 200, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 28, demandStdDev: 5, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-2101", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 60, reorderPoint: 150, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 20, demandStdDev: 7, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-2205", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 80, reorderPoint: 250, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 25, productionLeadTimeDays: 0, averageDailyDemand: 30, demandStdDev: 9, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-3310", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 100, reorderPoint: 400, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 200, orderMultiple: 50, productionLeadTimeDays: 0, averageDailyDemand: 45, demandStdDev: 12, serviceLevel: 0.95, abcClass: "C" },
  { material: "RM-4401", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 10, reorderPoint: 30, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 20, orderMultiple: 5, productionLeadTimeDays: 0, averageDailyDemand: 3.2, demandStdDev: 1.1, serviceLevel: 0.95, abcClass: "B" },

  { material: "PM-1001", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 1000, reorderPoint: 5000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 1000, orderMultiple: 500, productionLeadTimeDays: 0, averageDailyDemand: 450, demandStdDev: 60, serviceLevel: 0.95, abcClass: "A" },
  { material: "PM-1002", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 500, reorderPoint: 3000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 1000, orderMultiple: 500, productionLeadTimeDays: 0, averageDailyDemand: 320, demandStdDev: 50, serviceLevel: 0.95, abcClass: "B" },
  { material: "PM-2003", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 500, reorderPoint: 2000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 1000, orderMultiple: 500, productionLeadTimeDays: 0, averageDailyDemand: 300, demandStdDev: 45, serviceLevel: 0.95, abcClass: "B" },
  { material: "PM-2008", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 300, reorderPoint: 2000, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 1000, orderMultiple: 500, productionLeadTimeDays: 0, averageDailyDemand: 180, demandStdDev: 40, serviceLevel: 0.95, abcClass: "C" },
  { material: "PM-3004", location: "PUNE", procurementType: ProcurementType.BUY, safetyStock: 200, reorderPoint: 800, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 500, orderMultiple: 100, productionLeadTimeDays: 0, averageDailyDemand: 75, demandStdDev: 20, serviceLevel: 0.95, abcClass: "C" },

  // Manufactured items: supplied by production, so lead time comes from the
  // policy rather than a vendor.
  { material: "SA-101", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 200, reorderPoint: 500, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 1, averageDailyDemand: 250, demandStdDev: 40, serviceLevel: 0.95, abcClass: "A" },
  { material: "FG-001", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 150, reorderPoint: 400, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 2, averageDailyDemand: 100, demandStdDev: 25, serviceLevel: 0.97, abcClass: "A" },
  { material: "FG-002", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 80, reorderPoint: 200, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 2, averageDailyDemand: 60, demandStdDev: 18, serviceLevel: 0.95, abcClass: "B" },
  { material: "FG-003", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 120, reorderPoint: 300, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 200, orderMultiple: 50, productionLeadTimeDays: 2, averageDailyDemand: 90, demandStdDev: 22, serviceLevel: 0.95, abcClass: "B" },
  { material: "FG-004", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 60, reorderPoint: 150, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 2, averageDailyDemand: 40, demandStdDev: 12, serviceLevel: 0.95, abcClass: "C" },
  { material: "FG-005", location: "PUNE", procurementType: ProcurementType.MAKE, safetyStock: 90, reorderPoint: 250, lotSizingRule: LotSizingRule.MIN_ORDER_QTY, minOrderQty: 100, orderMultiple: 50, productionLeadTimeDays: 3, averageDailyDemand: 55, demandStdDev: 16, serviceLevel: 0.95, abcClass: "B" },
];

export interface SeedVendor {
  code: string;
  vendorCode: string;
  name: string;
  city: string;
  contactPerson: string;
  contactEmail: string;
  paymentTerms: string;
  isApproved: boolean;
  /** material code -> lead time in days, taken from the BOM tree's `lead`. */
  materials: { material: string; leadTimeDays: number; unitPrice: number; minOrderQty: number; isPreferred: boolean }[];
  scorecard: { defectRatePercent: number; onTimeDeliveryPercent: number; copqAmount: number; lastAuditDate: string; auditResult: string };
}

/**
 * Vendors from src/data/vendors.ts.
 *
 * `copq_amount: "₹4.2L"` becomes 420000 — a lakh is 100,000, and the column
 * is money, so it has to be a number to be summed or compared.
 */
export const VENDORS: SeedVendor[] = [
  {
    code: "SUP-001", vendorCode: "VEN-GS-001", name: "Galaxy Surfactants", city: "Mumbai",
    contactPerson: "Rakesh Menon", contactEmail: "rakesh.menon@galaxysurfactants.example", paymentTerms: "Net 30", isApproved: true,
    materials: [
      { material: "RM-4023", leadTimeDays: 7, unitPrice: 185, minOrderQty: 100, isPreferred: true },
      { material: "RM-2101", leadTimeDays: 9, unitPrice: 240, minOrderQty: 100, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 2.1, onTimeDeliveryPercent: 88, copqAmount: 420000, lastAuditDate: "2025-11-15", auditResult: "CONDITIONAL" },
  },
  {
    code: "SUP-002", vendorCode: "VEN-AI-002", name: "Aarti Industries", city: "Vapi",
    contactPerson: "Sunita Deshpande", contactEmail: "sunita.d@aarti.example", paymentTerms: "Net 45", isApproved: true,
    materials: [
      { material: "RM-5018", leadTimeDays: 10, unitPrice: 420, minOrderQty: 50, isPreferred: true },
      { material: "RM-1066", leadTimeDays: 8, unitPrice: 110, minOrderQty: 100, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 0.9, onTimeDeliveryPercent: 96, copqAmount: 120000, lastAuditDate: "2026-01-20", auditResult: "PASS" },
  },
  {
    code: "SUP-003", vendorCode: "VEN-RC-003", name: "Rashtriya Chemicals", city: "Mumbai",
    contactPerson: "Anil Kulkarni", contactEmail: "anil.k@rcf.example", paymentTerms: "Net 30", isApproved: true,
    materials: [
      { material: "RM-2087", leadTimeDays: 14, unitPrice: 145, minOrderQty: 200, isPreferred: true },
      { material: "RM-9055", leadTimeDays: 5, unitPrice: 38, minOrderQty: 250, isPreferred: true },
      { material: "RM-3310", leadTimeDays: 6, unitPrice: 22, minOrderQty: 200, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 1.4, onTimeDeliveryPercent: 92, copqAmount: 260000, lastAuditDate: "2025-12-05", auditResult: "PASS" },
  },
  {
    code: "SUP-004", vendorCode: "VEN-MT-004", name: "Mold-Tek Containers", city: "Hyderabad",
    contactPerson: "Praveen Rao", contactEmail: "praveen.rao@moldtek.example", paymentTerms: "Net 30", isApproved: true,
    materials: [
      { material: "PM-1001", leadTimeDays: 5, unitPrice: 42, minOrderQty: 1000, isPreferred: true },
      { material: "PM-2003", leadTimeDays: 5, unitPrice: 1.8, minOrderQty: 1000, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 1.8, onTimeDeliveryPercent: 90, copqAmount: 180000, lastAuditDate: "2025-10-28", auditResult: "PASS" },
  },
  {
    code: "SUP-005", vendorCode: "VEN-AP-005", name: "Aqua Pure Systems", city: "Pune",
    contactPerson: "Meera Joshi", contactEmail: "meera.joshi@aquapure.example", paymentTerms: "Net 15", isApproved: true,
    materials: [{ material: "RM-7044", leadTimeDays: 2, unitPrice: 2, minOrderQty: 1000, isPreferred: true }],
    scorecard: { defectRatePercent: 0.3, onTimeDeliveryPercent: 99, copqAmount: 20000, lastAuditDate: "2026-02-10", auditResult: "PASS" },
  },
  {
    code: "SUP-007", vendorCode: "VEN-DN-007", name: "Deepak Nitrite", city: "Vadodara",
    contactPerson: "Harsh Patel", contactEmail: "harsh.patel@deepaknitrite.example", paymentTerms: "Net 45", isApproved: true,
    materials: [
      { material: "RM-6031", leadTimeDays: 6, unitPrice: 320, minOrderQty: 100, isPreferred: true },
      { material: "RM-2205", leadTimeDays: 7, unitPrice: 85, minOrderQty: 100, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 1.1, onTimeDeliveryPercent: 94, copqAmount: 150000, lastAuditDate: "2026-01-08", auditResult: "PASS" },
  },
  {
    code: "SUP-008", vendorCode: "VEN-GI-008", name: "Givaudan India", city: "Chennai",
    contactPerson: "Lakshmi Narayanan", contactEmail: "lakshmi.n@givaudan.example", paymentTerms: "Net 60", isApproved: true,
    materials: [
      { material: "RM-8012", leadTimeDays: 10, unitPrice: 2800, minOrderQty: 20, isPreferred: true },
      { material: "RM-4401", leadTimeDays: 8, unitPrice: 650, minOrderQty: 20, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 0.6, onTimeDeliveryPercent: 97, copqAmount: 80000, lastAuditDate: "2026-02-18", auditResult: "PASS" },
  },
  {
    code: "SUP-011", vendorCode: "VEN-JA-011", name: "Jayant Agro", city: "Mumbai",
    contactPerson: "Devendra Shah", contactEmail: "devendra.shah@jayantagro.example", paymentTerms: "Net 30", isApproved: true,
    materials: [{ material: "RM-1177", leadTimeDays: 4, unitPrice: 95, minOrderQty: 100, isPreferred: true }],
    scorecard: { defectRatePercent: 2.6, onTimeDeliveryPercent: 85, copqAmount: 510000, lastAuditDate: "2025-09-30", auditResult: "CONDITIONAL" },
  },
  {
    code: "SUP-012", vendorCode: "VEN-UF-012", name: "Uflex Packaging", city: "Noida",
    contactPerson: "Kavita Sharma", contactEmail: "kavita.sharma@uflex.example", paymentTerms: "Net 30", isApproved: true,
    materials: [
      { material: "PM-1002", leadTimeDays: 4, unitPrice: 3.5, minOrderQty: 1000, isPreferred: true },
      { material: "PM-2008", leadTimeDays: 4, unitPrice: 3.2, minOrderQty: 1000, isPreferred: true },
      { material: "PM-3004", leadTimeDays: 6, unitPrice: 28, minOrderQty: 500, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 1.2, onTimeDeliveryPercent: 93, copqAmount: 140000, lastAuditDate: "2025-12-20", auditResult: "PASS" },
  },
  {
    code: "SUP-013", vendorCode: "VEN-RP-013", name: "Reliance Polymers", city: "Jamnagar",
    contactPerson: "Nikhil Verma", contactEmail: "nikhil.verma@relpoly.example", paymentTerms: "Net 45", isApproved: true,
    materials: [
      { material: "RM-1042", leadTimeDays: 7, unitPrice: 82, minOrderQty: 500, isPreferred: true },
      { material: "RM-3011", leadTimeDays: 5, unitPrice: 78, minOrderQty: 500, isPreferred: true },
    ],
    scorecard: { defectRatePercent: 0.8, onTimeDeliveryPercent: 95, copqAmount: 95000, lastAuditDate: "2026-01-30", auditResult: "PASS" },
  },
];

/** Customers from src/data/sales_orders.ts. */
export const CUSTOMERS = [
  { code: "CUST-001", name: "Reliance Retail", type: CustomerType.MODERN_TRADE, city: "Mumbai", paymentTerms: "Net 45" },
  { code: "CUST-002", name: "DMart Distribution", type: CustomerType.MODERN_TRADE, city: "Thane", paymentTerms: "Net 30" },
  { code: "CUST-003", name: "Metro Cash & Carry", type: CustomerType.INSTITUTIONAL, city: "Bengaluru", paymentTerms: "Net 60" },
  { code: "CUST-004", name: "Amazon Retail India", type: CustomerType.ECOMMERCE, city: "Hyderabad", paymentTerms: "Net 30" },
  { code: "CUST-005", name: "Shree Traders", type: CustomerType.DISTRIBUTOR, city: "Pune", paymentTerms: "Net 15" },
  { code: "CUST-006", name: "Hindustan Hospitality Supplies", type: CustomerType.INSTITUTIONAL, city: "New Delhi", paymentTerms: "Net 45" },
] as const;

/**
 * The permission catalogue. `resource:action`, one row each.
 *
 * Enforced in the service layer, not by hiding buttons — the UI reads these to
 * decide what to show, but the server checks them on every mutation.
 */
export const PERMISSIONS: { code: string; description: string }[] = [
  ...["material", "bom", "vendor", "customer", "location", "inventory", "sales-order", "forecast", "purchase-order", "work-order", "user", "role", "setting", "integration"].flatMap((resource) =>
    ["read", "create", "update", "delete"].map((action) => ({
      code: `${resource}:${action}`,
      description: `${action} ${resource.replace("-", " ")}`,
    })),
  ),
  { code: "mrp:read", description: "view MRP runs and results" },
  { code: "mrp:run", description: "execute an MRP run" },
  { code: "purchase-order:approve", description: "approve a purchase order" },
  { code: "inventory:adjust", description: "adjust stock levels" },
  { code: "goods-receipt:create", description: "receive goods against a purchase order" },
  { code: "audit:read", description: "read the audit trail" },
];

/** Seeded roles. `isSystem` roles cannot be deleted through the API. */
export const ROLES = [
  {
    code: "ADMIN",
    name: "Administrator",
    description: "Full access to every function, including users and settings.",
    isSystem: true,
    permissions: "*" as const,
  },
  {
    code: "PLANNER",
    name: "Production Planner",
    description: "Runs MRP and manages demand, BOMs and work orders.",
    isSystem: true,
    permissions: [
      "material:read", "bom:read", "bom:create", "bom:update",
      "vendor:read", "customer:read", "location:read", "inventory:read",
      "sales-order:read", "sales-order:create", "sales-order:update",
      "forecast:read", "forecast:create", "forecast:update",
      "purchase-order:read", "work-order:read", "work-order:create", "work-order:update",
      "mrp:read", "mrp:run", "setting:read",
    ],
  },
  {
    code: "PROCUREMENT",
    name: "Procurement",
    description: "Manages vendors, purchase orders and goods receipts.",
    isSystem: true,
    permissions: [
      "material:read", "bom:read", "location:read", "inventory:read",
      "vendor:read", "vendor:create", "vendor:update",
      "purchase-order:read", "purchase-order:create", "purchase-order:update", "purchase-order:approve",
      "goods-receipt:create", "mrp:read", "setting:read",
    ],
  },
  {
    code: "PRODUCTION",
    name: "Production",
    description: "Runs work orders on the shop floor.",
    isSystem: true,
    permissions: [
      "material:read", "bom:read", "location:read", "inventory:read",
      "work-order:read", "work-order:create", "work-order:update",
      "mrp:read", "setting:read",
    ],
  },
  {
    code: "INVENTORY",
    name: "Inventory Controller",
    description: "Owns stock accuracy, adjustments and goods receipt.",
    isSystem: true,
    permissions: [
      "material:read", "location:read",
      "inventory:read", "inventory:update", "inventory:adjust",
      "goods-receipt:create", "purchase-order:read", "work-order:read",
      "mrp:read", "setting:read",
    ],
  },
  {
    code: "VIEWER",
    name: "Viewer",
    description: "Read-only access across the product.",
    isSystem: true,
    permissions: [
      "material:read", "bom:read", "vendor:read", "customer:read", "location:read",
      "inventory:read", "sales-order:read", "forecast:read",
      "purchase-order:read", "work-order:read", "mrp:read", "setting:read",
    ],
  },
];

/** Demo users, one per role, so every permission path can be exercised. */
export const USERS = [
  { email: "admin@anvaya.in", name: "Aditi Rao", role: "ADMIN" },
  { email: "planner@anvaya.in", name: "Vikram Thakur", role: "PLANNER" },
  { email: "procurement@anvaya.in", name: "Priya Sharma", role: "PROCUREMENT" },
  { email: "production@anvaya.in", name: "Rajesh Kumar", role: "PRODUCTION" },
  { email: "inventory@anvaya.in", name: "Arun Mehta", role: "INVENTORY" },
  { email: "viewer@anvaya.in", name: "Neha Gupta", role: "VIEWER" },
] as const;
