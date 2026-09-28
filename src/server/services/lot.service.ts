import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import {
  MOVEMENT_REF, EXPIRY_WINDOW_DAYS,
  daysBetween, daysToExpiry, isExpiringSoon, lotValue, needsContainment, traceCompleteness,
  type LotRow, type LotDetail, type LotIndicators, type ReceiptRef, type TraceFacts, type TraceInput,
  type VendorRef, type Dispatch, type LotUsage, type ExpiringLot,
} from "@/server/inventory/lots";
import type { ListLotsQuery } from "@/server/validation/lot";

/**
 * Inventory lots — register, trace and indicators.
 *
 * Lots carry no companyId of their own; every query scopes through the lot's
 * material, which does. A lot id from another company therefore reads as not
 * found, the same as a missing one.
 */

const vendorSelect = { id: true, code: true, name: true, isApproved: true } satisfies Prisma.VendorSelect;

/** The receipt line that created a lot — at most one per lot in practice. */
const receiptSelect = {
  coaReference: true,
  inspectionStatus: true,
  inspectionDate: true,
  inspectorName: true,
  goodsReceipt: {
    select: { id: true, grnNumber: true, receiptDate: true, purchaseOrder: { select: { orderNumber: true } } },
  },
} satisfies Prisma.GoodsReceiptLineSelect;

const lotInclude = {
  material: {
    select: {
      id: true, code: true, name: true, kind: true, standardCost: true,
      unitOfMeasure: { select: { code: true } },
    },
  },
  location: { select: { id: true, code: true, name: true } },
  vendor: { select: vendorSelect },
  grnLines: { select: receiptSelect, orderBy: { createdAt: "asc" }, take: 1 },
  // The production receipt that created the lot, if it was made here.
  movements: {
    where: { type: StockMovementType.PRODUCTION_RECEIPT, referenceType: MOVEMENT_REF.WORK_ORDER },
    select: { referenceId: true },
    take: 1,
  },
} satisfies Prisma.InventoryLotInclude;

type LotWithRefs = Prisma.InventoryLotGetPayload<{ include: typeof lotInclude }>;
type ReceiptLine = Prisma.GoodsReceiptLineGetPayload<{ select: typeof receiptSelect }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function toReceipt(line: ReceiptLine | undefined): ReceiptRef | null {
  if (!line) return null;
  return {
    goodsReceiptId: line.goodsReceipt.id,
    grnNumber: line.goodsReceipt.grnNumber,
    receiptDate: isoDate(line.goodsReceipt.receiptDate)!,
    purchaseOrderNumber: line.goodsReceipt.purchaseOrder.orderNumber,
    coaReference: line.coaReference,
    inspectionStatus: line.inspectionStatus,
    inspectionDate: isoDate(line.inspectionDate),
    inspectorName: line.inspectorName,
  };
}

const toVendor = (v: VendorRef | null): VendorRef | null => (v ? { ...v } : null);

interface ProducingOrder {
  id: string;
  orderNumber: string;
  bomVersion: { version: string; bom: { code: string; name: string } } | null;
  _count: { components: number };
}

function toLotRow(lot: LotWithRefs, producer: ProducingOrder | null, asOf: Date): LotRow {
  const remaining = toNumber(lot.remainingQty);
  const receipt = lot.grnLines[0];
  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    material: { id: lot.material.id, code: lot.material.code, name: lot.material.name, kind: lot.material.kind },
    uom: lot.material.unitOfMeasure.code,
    location: lot.location,
    storageLocation: lot.storageLocation,
    bin: lot.bin,
    receivedQty: toNumber(lot.receivedQty),
    consumedQty: toNumber(lot.consumedQty),
    remainingQty: remaining,
    receiptDate: isoDate(lot.receiptDate)!,
    expiryDate: isoDate(lot.expiryDate),
    qcStatus: lot.qcStatus,
    source: producer ? "PRODUCED" : receipt || lot.vendorId ? "PURCHASED" : "UNKNOWN",
    vendor: toVendor(lot.vendor),
    supplierLotNumber: lot.supplierLotNumber,
    coaReference: receipt?.coaReference ?? lot.coaReference,
    workOrder: producer
      ? {
          id: producer.id,
          orderNumber: producer.orderNumber,
          bomCode: producer.bomVersion?.bom.code ?? null,
          bomVersion: producer.bomVersion?.version ?? null,
        }
      : null,
    inputCount: producer ? producer._count.components : null,
    ageDays: Math.max(0, daysBetween(lot.receiptDate, asOf)),
    value: lotValue(remaining, toNumber(lot.material.standardCost)),
  };
}

/** The work orders that produced the given lots, keyed by work order id. */
async function producingOrders(companyId: string, lots: LotWithRefs[]) {
  const ids = [...new Set(lots.map((l) => l.movements[0]?.referenceId).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map<string, ProducingOrder>();

  const orders = await prisma.workOrder.findMany({
    where: { id: { in: ids }, companyId },
    select: {
      id: true, orderNumber: true,
      bomVersion: { select: { version: true, bom: { select: { code: true, name: true } } } },
      _count: { select: { components: true } },
    },
  });
  return new Map(orders.map((o) => [o.id, o]));
}

function producerOf(lot: LotWithRefs, orders: Map<string, ProducingOrder>) {
  const ref = lot.movements[0]?.referenceId;
  return (ref && orders.get(ref)) || null;
}

/* ---- Register ------------------------------------------------------------- */

export async function listLots(companyId: string, query: ListLotsQuery, asOf = new Date()) {
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

  const where: Prisma.InventoryLotWhereInput = {
    material: { companyId, ...(query.kind ? { kind: query.kind } : {}) },
    ...(query.qcStatus ? { qcStatus: query.qcStatus } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.q
      ? {
          OR: [
            { lotNumber: contains(query.q) },
            { supplierLotNumber: contains(query.q) },
            { material: { code: contains(query.q) } },
            { material: { name: contains(query.q) } },
            { location: { name: contains(query.q) } },
            { vendor: { name: contains(query.q) } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.inventoryLot.findMany({
      where,
      include: lotInclude,
      orderBy: [{ receiptDate: "desc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
    prisma.inventoryLot.count({ where }),
  ]);

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const orders = await producingOrders(companyId, page);

  return {
    items: page.map((l) => toLotRow(l, producerOf(l, orders), asOf)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    total,
  };
}

/* ---- Detail and trace ------------------------------------------------------ */

export async function getLotDetail(companyId: string, id: string, asOf = new Date()): Promise<LotDetail> {
  const lot = await prisma.inventoryLot.findFirst({
    where: { id, material: { companyId } },
    include: lotInclude,
  });
  if (!lot) throw AppError.notFound("Lot", id);

  const producerId = lot.movements[0]?.referenceId ?? null;

  const [workOrder, dispatchMovements, usage] = await Promise.all([
    producerId
      ? prisma.workOrder.findFirst({
          where: { id: producerId, companyId },
          include: {
            bomVersion: { include: { bom: { select: { code: true, name: true } } } },
            components: {
              include: {
                material: {
                  select: { id: true, code: true, name: true, kind: true, unitOfMeasure: { select: { code: true } } },
                },
                lot: {
                  include: {
                    vendor: { select: vendorSelect },
                    grnLines: { select: receiptSelect, orderBy: { createdAt: "asc" }, take: 1 },
                  },
                },
              },
              orderBy: { material: { code: "asc" } },
            },
            _count: { select: { components: true } },
          },
        })
      : null,
    prisma.stockMovement.findMany({
      where: { lotId: lot.id, type: StockMovementType.ISSUE, referenceType: MOVEMENT_REF.SALES_ORDER_LINE },
      select: { referenceId: true, quantity: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.workOrderComponent.findMany({
      where: { lotId: lot.id, workOrder: { companyId } },
      include: {
        workOrder: {
          select: { id: true, orderNumber: true, status: true, material: { select: { code: true, name: true } } },
        },
      },
      orderBy: { workOrder: { orderNumber: "asc" } },
    }),
  ]);

  const lineIds = dispatchMovements.map((m) => m.referenceId).filter((v): v is string => !!v);
  const soLines = lineIds.length
    ? await prisma.salesOrderLine.findMany({
        where: { id: { in: lineIds }, salesOrder: { companyId } },
        include: { salesOrder: { include: { customer: { select: { name: true } } } } },
      })
    : [];
  const lineById = new Map(soLines.map((l) => [l.id, l]));

  const dispatches: Dispatch[] = dispatchMovements.flatMap((m) => {
    const line = m.referenceId ? lineById.get(m.referenceId) : undefined;
    if (!line) return [];
    return [{
      salesOrderId: line.salesOrder.id,
      orderNumber: line.salesOrder.orderNumber,
      customer: line.salesOrder.customer.name,
      quantity: Math.abs(toNumber(m.quantity)),
      invoiceNumber: line.salesOrder.invoiceNumber,
      deliveryStatus: line.salesOrder.deliveryStatus,
      dispatchedAt: isoDate(m.occurredAt)!,
    }];
  });

  const usedIn: LotUsage[] = usage.map((c) => ({
    workOrderId: c.workOrder.id,
    orderNumber: c.workOrder.orderNumber,
    status: c.workOrder.status,
    product: c.workOrder.material,
    requiredQty: toNumber(c.requiredQty),
    issuedQty: toNumber(c.issuedQty),
  }));

  const inputs: TraceInput[] = (workOrder?.components ?? []).map((c) => {
    const cl = c.lot;
    const vendor = cl ? toVendor(cl.vendor) : null;
    return {
      material: { id: c.material.id, code: c.material.code, name: c.material.name, kind: c.material.kind },
      uom: c.material.unitOfMeasure.code,
      requiredQty: toNumber(c.requiredQty),
      issuedQty: toNumber(c.issuedQty),
      lot: cl
        ? {
            id: cl.id,
            lotNumber: cl.lotNumber,
            qcStatus: cl.qcStatus,
            supplierLotNumber: cl.supplierLotNumber,
            coaReference: cl.grnLines[0]?.coaReference ?? cl.coaReference,
            storageLocation: cl.storageLocation,
            bin: cl.bin,
            vendor,
            receipt: toReceipt(cl.grnLines[0]),
          }
        : null,
      suspect: cl ? needsContainment(cl.qcStatus) : false,
      nonApprovedVendor: vendor ? !vendor.isApproved : false,
    };
  });

  const producer: ProducingOrder | null = workOrder
    ? {
        id: workOrder.id,
        orderNumber: workOrder.orderNumber,
        bomVersion: workOrder.bomVersion ? { version: workOrder.bomVersion.version, bom: workOrder.bomVersion.bom } : null,
        _count: workOrder._count,
      }
    : null;

  return {
    ...toLotRow(lot, producer, asOf),
    releaseDate: isoDate(lot.releaseDate),
    releasedBy: lot.releasedBy,
    receipt: toReceipt(lot.grnLines[0]),
    production: workOrder
      ? {
          workOrderId: workOrder.id,
          orderNumber: workOrder.orderNumber,
          status: workOrder.status,
          producedQty: toNumber(workOrder.producedQty),
          bom: workOrder.bomVersion
            ? { code: workOrder.bomVersion.bom.code, name: workOrder.bomVersion.bom.name, version: workOrder.bomVersion.version }
            : null,
          inputs,
        }
      : null,
    dispatches,
    usedIn,
  };
}

/* ---- Indicators ------------------------------------------------------------ */

/**
 * Trace completeness, containment and expiry across every lot the company
 * holds. Loads the whole lot population — fine at hundreds of lots; a
 * company with tens of thousands would want these figures materialised.
 */
export async function getLotIndicators(companyId: string, asOf = new Date()): Promise<LotIndicators> {
  const lots = await prisma.inventoryLot.findMany({
    where: { material: { companyId } },
    select: {
      id: true, lotNumber: true, qcStatus: true,
      consumedQty: true, remainingQty: true, expiryDate: true,
      material: { select: { name: true, standardCost: true, unitOfMeasure: { select: { code: true } } } },
      grnLines: { select: { coaReference: true }, take: 1 },
      // Outflows a record explains: any negative ledger entry on the lot…
      movements: {
        where: { OR: [{ quantity: { lt: 0 } }, { type: StockMovementType.PRODUCTION_RECEIPT, referenceType: MOVEMENT_REF.WORK_ORDER }] },
        select: { quantity: true, type: true, referenceId: true },
      },
      // …and quantities issued to work orders against it.
      consumedBy: { select: { issuedQty: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const producerIds = [...new Set(
    lots.flatMap((l) => l.movements.filter((m) => m.type === StockMovementType.PRODUCTION_RECEIPT).map((m) => m.referenceId))
      .filter((v): v is string => !!v),
  )];
  const orders = producerIds.length
    ? await prisma.workOrder.findMany({
        where: { id: { in: producerIds }, companyId },
        select: { id: true, components: { select: { lot: { select: { grnLines: { select: { coaReference: true }, take: 1 } } } } } },
      })
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const facts: TraceFacts[] = lots.map((l) => {
    const producerRef = l.movements.find((m) => m.type === StockMovementType.PRODUCTION_RECEIPT)?.referenceId;
    const order = producerRef ? orderById.get(producerRef) : undefined;
    const out = l.movements.filter((m) => toNumber(m.quantity) < 0).reduce((s, m) => s + Math.abs(toNumber(m.quantity)), 0);
    const issued = l.consumedBy.reduce((s, c) => s + toNumber(c.issuedQty), 0);
    return {
      receipt: l.grnLines[0] ? { coaReference: l.grnLines[0].coaReference } : null,
      production: order
        ? { components: order.components.map((c) => ({ lot: c.lot ? { receipt: c.lot.grnLines[0] ? { coaReference: c.lot.grnLines[0].coaReference } : null } : null })) }
        : null,
      consumedQty: toNumber(l.consumedQty),
      accountedOutQty: out + issued,
    };
  });

  const expiring: ExpiringLot[] = lots
    .map((l) => ({ l, remaining: toNumber(l.remainingQty) }))
    .filter(({ l, remaining }) => isExpiringSoon({ remainingQty: remaining, expiryDate: l.expiryDate }, asOf))
    .map(({ l, remaining }) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      material: l.material.name,
      remainingQty: remaining,
      uom: l.material.unitOfMeasure.code,
      expiryDate: isoDate(l.expiryDate)!,
      daysLeft: daysToExpiry({ remainingQty: remaining, expiryDate: l.expiryDate }, asOf)!,
      value: lotValue(remaining, toNumber(l.material.standardCost)),
    }));

  return {
    asOf: iso(asOf)!,
    ...traceCompleteness(facts),
    containmentLots: lots.filter((l) => needsContainment(l.qcStatus)).length,
    expiring,
    expiryWindowDays: EXPIRY_WINDOW_DAYS,
  };
}
