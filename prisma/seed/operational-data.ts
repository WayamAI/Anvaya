/**
 * Operational demo data: stock, open supply, demand and production.
 *
 * Shaped so the MRP engine has something real to chew on in Phase 7. The
 * numbers are deliberately arranged to produce all of: a comfortable material,
 * a material covered only by an incoming PO, and several genuine shortages —
 * including one at BOM level 2, which only a multi-level explosion can find.
 *
 * Quantities come from src/views/StockOverview.tsx and src/data/*.ts with the
 * thousands separators and unit suffixes stripped ("4,200 kg" -> 4200).
 */

import { PurchaseOrderStatus, SalesOrderStatus, DeliveryStatus, WorkOrderStatus, QcStatus, ConstraintType, IntegrationStatus } from "@prisma/client";

/** The planning "today" for the demo dataset. */
export const AS_OF_DATE = "2026-03-25";

export interface SeedBalance {
  material: string;
  location: string;
  onHandQty: number;
  reservedQty?: number;
  quarantineQty?: number;
}

/**
 * Opening stock, from the Stock Overview table's per-warehouse columns.
 * Materials with no row there start at zero, which is itself meaningful —
 * MRP should plan them from scratch.
 */
export const BALANCES: SeedBalance[] = [
  { material: "RM-1042", location: "PUNE", onHandQty: 4200 },
  { material: "RM-1042", location: "MUMBAI", onHandQty: 1800 },
  { material: "RM-2087", location: "PUNE", onHandQty: 180 },
  { material: "RM-3011", location: "PUNE", onHandQty: 6200 },
  { material: "RM-3011", location: "MUMBAI", onHandQty: 3600 },
  { material: "RM-4023", location: "PUNE", onHandQty: 1050, reservedQty: 200 },
  { material: "RM-4023", location: "MUMBAI", onHandQty: 400 },
  { material: "RM-5018", location: "PUNE", onHandQty: 95 },
  { material: "RM-6031", location: "PUNE", onHandQty: 440 },
  { material: "RM-6031", location: "MUMBAI", onHandQty: 200 },
  { material: "RM-7044", location: "PUNE", onHandQty: 8000 },
  { material: "RM-7044", location: "MUMBAI", onHandQty: 4000 },
  { material: "RM-8012", location: "PUNE", onHandQty: 12 },
  { material: "RM-8012", location: "MUMBAI", onHandQty: 10 },
  { material: "RM-9055", location: "PUNE", onHandQty: 1800 },
  { material: "RM-1066", location: "PUNE", onHandQty: 280 },
  { material: "RM-1177", location: "PUNE", onHandQty: 300 },
  { material: "RM-2101", location: "PUNE", onHandQty: 210 },
  { material: "RM-2205", location: "PUNE", onHandQty: 340 },
  { material: "RM-3310", location: "PUNE", onHandQty: 480 },
  { material: "RM-4401", location: "PUNE", onHandQty: 30 },
  { material: "PM-1001", location: "PUNE", onHandQty: 5200, reservedQty: 800 },
  { material: "PM-1002", location: "PUNE", onHandQty: 3000 },
  { material: "PM-2003", location: "PUNE", onHandQty: 2200 },
  { material: "PM-2008", location: "PUNE", onHandQty: 800 },
  { material: "PM-3004", location: "PUNE", onHandQty: 1200 },
  { material: "SA-101", location: "PUNE", onHandQty: 320 },
  { material: "FG-001", location: "PUNE", onHandQty: 180, reservedQty: 120 },
  { material: "FG-002", location: "PUNE", onHandQty: 95 },
  { material: "FG-003", location: "PUNE", onHandQty: 210 },
];

export interface SeedLot {
  lotNumber: string;
  material: string;
  location: string;
  vendor?: string;
  supplierLotNumber?: string;
  receivedQty: number;
  consumedQty: number;
  receiptDate: string;
  expiryDate?: string;
  qcStatus: QcStatus;
  coaReference?: string;
  storageLocation?: string;
  bin?: string;
}

/** Batches from src/data/rm_batches.ts, carrying the vendor lot for traceability. */
export const LOTS: SeedLot[] = [
  { lotNumber: "RMB-2026-0451", material: "RM-4023", location: "PUNE", vendor: "SUP-001", supplierLotNumber: "GS-SLS-88421", receivedQty: 1200, consumedQty: 350, receiptDate: "2026-02-15", expiryDate: "2028-02-15", qcStatus: QcStatus.APPROVED, coaReference: "COA-GS-88421", storageLocation: "Chemical Store A", bin: "A-12" },
  { lotNumber: "RMB-2026-0452", material: "RM-5018", location: "PUNE", vendor: "SUP-002", supplierLotNumber: "AI-EDTA-5567", receivedQty: 150, consumedQty: 55, receiptDate: "2026-02-20", expiryDate: "2029-02-20", qcStatus: QcStatus.APPROVED, coaReference: "COA-AI-5567", storageLocation: "Chemical Store A", bin: "A-18" },
  { lotNumber: "RMB-2026-0453", material: "RM-2087", location: "PUNE", vendor: "SUP-003", supplierLotNumber: "RC-STA-3310", receivedQty: 400, consumedQty: 220, receiptDate: "2026-02-22", expiryDate: "2028-02-22", qcStatus: QcStatus.APPROVED, coaReference: "COA-RC-3310", storageLocation: "Chemical Store B", bin: "B-04" },
  { lotNumber: "RMB-2026-0461", material: "RM-8012", location: "PUNE", vendor: "SUP-008", supplierLotNumber: "GI-FR04-9912", receivedQty: 40, consumedQty: 28, receiptDate: "2026-03-01", expiryDate: "2027-03-01", qcStatus: QcStatus.APPROVED, coaReference: "COA-GI-9912", storageLocation: "Fragrance Vault", bin: "F-02" },
  { lotNumber: "RMB-2026-0470", material: "PM-1001", location: "PUNE", vendor: "SUP-004", supplierLotNumber: "MT-HDPE-7741", receivedQty: 6000, consumedQty: 800, receiptDate: "2026-03-05", qcStatus: QcStatus.APPROVED, coaReference: "COA-MT-7741", storageLocation: "Packaging Store", bin: "P-01" },
  { lotNumber: "RMB-2026-0478", material: "RM-6031", location: "PUNE", vendor: "SUP-007", supplierLotNumber: "DN-TIO2-2204", receivedQty: 500, consumedQty: 60, receiptDate: "2026-03-10", qcStatus: QcStatus.QUARANTINE, coaReference: "COA-DN-2204", storageLocation: "Quarantine Bay", bin: "Q-03" },
  { lotNumber: "RMB-2026-0482", material: "RM-1042", location: "PUNE", vendor: "SUP-013", supplierLotNumber: "RP-PP-5510", receivedQty: 5000, consumedQty: 800, receiptDate: "2026-03-12", qcStatus: QcStatus.APPROVED, coaReference: "COA-RP-5510", storageLocation: "Polymer Yard", bin: "Y-07" },
];

export interface SeedPurchaseOrder {
  orderNumber: string;
  vendor: string;
  location: string;
  orderDate: string;
  expectedDeliveryDate: string;
  status: PurchaseOrderStatus;
  lines: { material: string; orderedQty: number; receivedQty: number; unitPrice: number }[];
}

/**
 * Purchase orders from src/data/purchase_orders.ts, plus open orders dated
 * after AS_OF_DATE so MRP has incoming supply to net against. The partially
 * received one is what exercises the receiving maths.
 */
export const PURCHASE_ORDERS: SeedPurchaseOrder[] = [
  {
    orderNumber: "PO-2026-0198", vendor: "SUP-001", location: "PUNE",
    orderDate: "2026-02-05", expectedDeliveryDate: "2026-02-15", status: PurchaseOrderStatus.FULLY_RECEIVED,
    lines: [{ material: "RM-4023", orderedQty: 1200, receivedQty: 1200, unitPrice: 185 }],
  },
  {
    orderNumber: "PO-2026-0203", vendor: "SUP-002", location: "PUNE",
    orderDate: "2026-02-10", expectedDeliveryDate: "2026-02-20", status: PurchaseOrderStatus.FULLY_RECEIVED,
    lines: [{ material: "RM-5018", orderedQty: 150, receivedQty: 150, unitPrice: 420 }],
  },
  {
    orderNumber: "PO-2026-0241", vendor: "SUP-003", location: "PUNE",
    orderDate: "2026-03-18", expectedDeliveryDate: "2026-04-01", status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
    lines: [{ material: "RM-2087", orderedQty: 600, receivedQty: 250, unitPrice: 145 }],
  },
  // Open supply: MRP must count these as scheduled receipts.
  {
    orderNumber: "PO-2026-0255", vendor: "SUP-001", location: "PUNE",
    orderDate: "2026-03-20", expectedDeliveryDate: "2026-04-03", status: PurchaseOrderStatus.ORDERED,
    lines: [{ material: "RM-4023", orderedQty: 800, receivedQty: 0, unitPrice: 185 }],
  },
  {
    orderNumber: "PO-2026-0256", vendor: "SUP-004", location: "PUNE",
    orderDate: "2026-03-21", expectedDeliveryDate: "2026-03-30", status: PurchaseOrderStatus.ORDERED,
    lines: [
      { material: "PM-1001", orderedQty: 4000, receivedQty: 0, unitPrice: 42 },
      { material: "PM-2003", orderedQty: 4000, receivedQty: 0, unitPrice: 1.8 },
    ],
  },
  {
    orderNumber: "PO-2026-0257", vendor: "SUP-008", location: "PUNE",
    orderDate: "2026-03-22", expectedDeliveryDate: "2026-04-05", status: PurchaseOrderStatus.APPROVED,
    lines: [{ material: "RM-8012", orderedQty: 60, receivedQty: 0, unitPrice: 2800 }],
  },
];

export interface SeedGoodsReceipt {
  grnNumber: string;
  purchaseOrder: string;
  vendor: string;
  location: string;
  receiptDate: string;
  lines: { material: string; receivedQty: number; lotNumber?: string; supplierLotNumber?: string; coaReference?: string; inspectionStatus: QcStatus; inspectorName?: string }[];
}

/** GRNs from src/data/grn.ts, each tied to the PO line it fulfilled. */
export const GOODS_RECEIPTS: SeedGoodsReceipt[] = [
  {
    grnNumber: "GRN-2026-0312", purchaseOrder: "PO-2026-0198", vendor: "SUP-001", location: "PUNE", receiptDate: "2026-02-15",
    lines: [{ material: "RM-4023", receivedQty: 1200, lotNumber: "RMB-2026-0451", supplierLotNumber: "GS-SLS-88421", coaReference: "COA-GS-88421", inspectionStatus: QcStatus.APPROVED, inspectorName: "S. Iyer" }],
  },
  {
    grnNumber: "GRN-2026-0327", purchaseOrder: "PO-2026-0203", vendor: "SUP-002", location: "PUNE", receiptDate: "2026-02-20",
    lines: [{ material: "RM-5018", receivedQty: 150, lotNumber: "RMB-2026-0452", supplierLotNumber: "AI-EDTA-5567", coaReference: "COA-AI-5567", inspectionStatus: QcStatus.APPROVED, inspectorName: "S. Iyer" }],
  },
  {
    grnNumber: "GRN-2026-0388", purchaseOrder: "PO-2026-0241", vendor: "SUP-003", location: "PUNE", receiptDate: "2026-03-24",
    lines: [{ material: "RM-2087", receivedQty: 250, lotNumber: "RMB-2026-0453", supplierLotNumber: "RC-STA-3310", coaReference: "COA-RC-3310", inspectionStatus: QcStatus.APPROVED, inspectorName: "M. Pillai" }],
  },
];

export interface SeedSalesOrder {
  orderNumber: string;
  customer: string;
  orderDate: string;
  requiredDate: string;
  status: SalesOrderStatus;
  deliveryStatus: DeliveryStatus;
  invoiceNumber?: string;
  lines: { material: string; location: string; quantity: number; shippedQty: number; unitPrice: number; requiredDate: string }[];
}

/**
 * Demand. The open orders after AS_OF_DATE are what drive the MRP run; the
 * delivered ones give the Forecast vs Actuals screen history to compare.
 */
export const SALES_ORDERS: SeedSalesOrder[] = [
  {
    orderNumber: "SO-4521", customer: "CUST-001", orderDate: "2026-03-19", requiredDate: "2026-03-24",
    status: SalesOrderStatus.DELIVERED, deliveryStatus: DeliveryStatus.DELIVERED, invoiceNumber: "INV-2026-1187",
    lines: [{ material: "FG-001", location: "PUNE", quantity: 240, shippedQty: 240, unitPrice: 890, requiredDate: "2026-03-24" }],
  },
  {
    orderNumber: "SO-4538", customer: "CUST-002", orderDate: "2026-03-21", requiredDate: "2026-04-02",
    status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
    lines: [
      { material: "FG-001", location: "PUNE", quantity: 500, shippedQty: 0, unitPrice: 890, requiredDate: "2026-04-02" },
      { material: "FG-003", location: "PUNE", quantity: 300, shippedQty: 0, unitPrice: 140, requiredDate: "2026-04-02" },
    ],
  },
  {
    orderNumber: "SO-4544", customer: "CUST-004", orderDate: "2026-03-22", requiredDate: "2026-04-08",
    status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
    lines: [{ material: "FG-001", location: "PUNE", quantity: 320, shippedQty: 0, unitPrice: 905, requiredDate: "2026-04-08" }],
  },
  {
    orderNumber: "SO-4551", customer: "CUST-003", orderDate: "2026-03-23", requiredDate: "2026-04-15",
    status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
    lines: [
      { material: "FG-002", location: "PUNE", quantity: 260, shippedQty: 0, unitPrice: 290, requiredDate: "2026-04-15" },
      { material: "FG-005", location: "PUNE", quantity: 180, shippedQty: 0, unitPrice: 820, requiredDate: "2026-04-15" },
    ],
  },
  {
    orderNumber: "SO-4560", customer: "CUST-005", orderDate: "2026-03-24", requiredDate: "2026-04-20",
    status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
    lines: [{ material: "FG-001", location: "PUNE", quantity: 400, shippedQty: 0, unitPrice: 880, requiredDate: "2026-04-20" }],
  },
  {
    orderNumber: "SO-4566", customer: "CUST-006", orderDate: "2026-03-24", requiredDate: "2026-05-05",
    status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
    lines: [{ material: "FG-004", location: "PUNE", quantity: 150, shippedQty: 0, unitPrice: 185, requiredDate: "2026-05-05" }],
  },
];

export interface SeedForecast {
  material: string;
  location: string;
  name: string;
  periods: { periodStart: string; periodEnd: string; forecastQty: number; actualQty?: number; consumedQty?: number }[];
}

/**
 * Monthly forecast per finished good.
 *
 * April already carries confirmed sales orders, so `consumedQty` records how
 * much of the forecast those orders have absorbed. MRP counts the greater of
 * forecast-remaining and booked demand, never the sum — otherwise every
 * confirmed order would inflate the plan twice.
 */
export const FORECASTS: SeedForecast[] = [
  {
    material: "FG-001", location: "PUNE", name: "FG-001 monthly demand plan",
    periods: [
      { periodStart: "2026-03-01", periodEnd: "2026-03-31", forecastQty: 1100, actualQty: 980, consumedQty: 980 },
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", forecastQty: 1400, consumedQty: 1220 },
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", forecastQty: 1500, consumedQty: 0 },
      { periodStart: "2026-06-01", periodEnd: "2026-06-30", forecastQty: 1350, consumedQty: 0 },
    ],
  },
  {
    material: "FG-002", location: "PUNE", name: "FG-002 monthly demand plan",
    periods: [
      { periodStart: "2026-03-01", periodEnd: "2026-03-31", forecastQty: 600, actualQty: 640, consumedQty: 640 },
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", forecastQty: 700, consumedQty: 260 },
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", forecastQty: 720, consumedQty: 0 },
    ],
  },
  {
    material: "FG-003", location: "PUNE", name: "FG-003 monthly demand plan",
    periods: [
      { periodStart: "2026-03-01", periodEnd: "2026-03-31", forecastQty: 900, actualQty: 870, consumedQty: 870 },
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", forecastQty: 950, consumedQty: 300 },
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", forecastQty: 1000, consumedQty: 0 },
    ],
  },
  {
    material: "FG-005", location: "PUNE", name: "FG-005 monthly demand plan",
    periods: [
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", forecastQty: 520, consumedQty: 180 },
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", forecastQty: 560, consumedQty: 0 },
    ],
  },
];

export interface SeedWorkOrder {
  orderNumber: string;
  material: string;
  location: string;
  bomCode?: string;
  plannedQty: number;
  producedQty: number;
  plannedStartDate: string;
  plannedEndDate: string;
  status: WorkOrderStatus;
  operations: { sequence: number; name: string; workCentre: string; setupMinutes: number; runMinutes: number }[];
}

/**
 * Work orders. The released ones are open supply that MRP must net against,
 * exactly like an open purchase order.
 */
export const WORK_ORDERS: SeedWorkOrder[] = [
  {
    orderNumber: "WO-2026-0091", material: "FG-001", location: "PUNE", bomCode: "BOM-FG-001",
    plannedQty: 500, producedQty: 500, plannedStartDate: "2026-03-10", plannedEndDate: "2026-03-14", status: WorkOrderStatus.COMPLETED,
    operations: [
      { sequence: 10, name: "Blending", workCentre: "BLEND-01", setupMinutes: 45, runMinutes: 240 },
      { sequence: 20, name: "Filling", workCentre: "FILL-02", setupMinutes: 30, runMinutes: 180 },
      { sequence: 30, name: "Labelling & packing", workCentre: "PACK-01", setupMinutes: 20, runMinutes: 150 },
    ],
  },
  {
    orderNumber: "WO-2026-0104", material: "SA-101", location: "PUNE", bomCode: "BOM-SA-101",
    plannedQty: 600, producedQty: 0, plannedStartDate: "2026-03-26", plannedEndDate: "2026-03-27", status: WorkOrderStatus.RELEASED,
    operations: [
      { sequence: 10, name: "Charge & mix", workCentre: "BLEND-01", setupMinutes: 40, runMinutes: 300 },
      { sequence: 20, name: "QC sampling", workCentre: "QC-LAB", setupMinutes: 10, runMinutes: 60 },
    ],
  },
  {
    orderNumber: "WO-2026-0108", material: "FG-001", location: "PUNE", bomCode: "BOM-FG-001",
    plannedQty: 350, producedQty: 0, plannedStartDate: "2026-03-28", plannedEndDate: "2026-03-31", status: WorkOrderStatus.FIRMED,
    operations: [
      { sequence: 10, name: "Blending", workCentre: "BLEND-01", setupMinutes: 45, runMinutes: 200 },
      { sequence: 20, name: "Filling", workCentre: "FILL-02", setupMinutes: 30, runMinutes: 140 },
      { sequence: 30, name: "Labelling & packing", workCentre: "PACK-01", setupMinutes: 20, runMinutes: 120 },
    ],
  },
];

export const CONSTRAINTS = [
  { name: "Blending line BLEND-01", type: ConstraintType.CAPACITY, location: "PUNE", unit: "litres/day", capacity: 4000, utilised: 3100, effectiveFrom: "2026-01-01" },
  { name: "Filling line FILL-02", type: ConstraintType.CAPACITY, location: "PUNE", unit: "units/day", capacity: 2400, utilised: 1850, effectiveFrom: "2026-01-01" },
  { name: "Shift labour — packing", type: ConstraintType.LABOUR, location: "PUNE", unit: "hours/shift", capacity: 64, utilised: 52, effectiveFrom: "2026-01-01" },
  { name: "Hazardous storage licence cap", type: ConstraintType.REGULATORY, location: "PUNE", unit: "kg", capacity: 12000, utilised: 8400, effectiveFrom: "2026-01-01" },
] as const;

export const INTEGRATIONS = [
  { code: "TALLY", name: "Tally ERP", category: "ACCOUNTING", status: IntegrationStatus.CONNECTED, isActive: true, lastSyncStatus: "SUCCESS" },
  { code: "SAP_B1", name: "SAP Business One", category: "ERP", status: IntegrationStatus.DISCONNECTED, isActive: false },
  { code: "UNICOMMERCE", name: "Unicommerce WMS", category: "WMS", status: IntegrationStatus.ERROR, isActive: true, lastSyncStatus: "FAILED", lastErrorText: "Authentication token expired" },
  { code: "SHOPIFY", name: "Shopify Storefront", category: "ECOMMERCE", status: IntegrationStatus.PENDING, isActive: false },
] as const;

/** Defaults the MRP engine reads at run time. */
export const SETTINGS = [
  { namespace: "mrp", key: "defaultHorizonDays", value: 90, description: "How far ahead an MRP run plans by default." },
  { namespace: "mrp", key: "bucketSizeDays", value: 1, description: "Planning bucket width in days." },
  { namespace: "mrp", key: "includeForecast", value: true, description: "Whether forecast demand is planned alongside sales orders." },
  { namespace: "mrp", key: "forecastConsumption", value: true, description: "Net booked sales orders against the forecast rather than adding both." },
  { namespace: "inventory", key: "allowNegativeStock", value: false, description: "Whether issues may drive a balance below zero." },
  { namespace: "inventory", key: "defaultValuationMethod", value: "MOVING_AVERAGE", description: "How stock value is computed." },
  { namespace: "procurement", key: "requirePoApproval", value: true, description: "Whether a purchase order needs approval before ordering." },
] as const;
