import { AuditAction, DeliveryStatus, Prisma, SalesOrderStatus, StockMovementType } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { companyContext, dateOnly, isoDate, yearOf } from "@/server/config/business-date";
import { getSetting } from "@/server/config/company-settings";
import { nextDocumentNumber } from "@/server/db/sequence";
import { lockRow, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { MOVEMENT_REF } from "@/server/inventory/lots";
import { lineTotal, orderTotal } from "@/server/purchasing/po-rules";
import {
  allocateFefo, assertSoTransition, lotShippable, planDispatch, statusAfterDispatch,
  type CandidateLot, type DispatchLineInput,
} from "@/server/sales/so-rules";
import type {
  CancelSalesOrderInput, CreateSalesOrderInput, DeliverInput, DispatchInput, UpdateSalesOrderInput,
} from "@/server/validation/sales";
import { lockBalances, postMovement } from "./stock-ledger.service";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Sales orders — write side: book, edit, cancel, dispatch, deliver.
 *
 * Same discipline as purchasing: one transaction per operation, the order
 * row locked first, references resolved within the caller's company, audit
 * inside the transaction. Dispatch moves stock through the ledger service,
 * which locks each balance and refuses to ship more than is unrestricted.
 */

type LineInput = CreateSalesOrderInput["lines"][number];

async function resolveCustomer(tx: Tx, companyId: string, customerId: string) {
  const c = await tx.customer.findFirst({ where: { id: customerId, companyId }, select: { id: true, code: true, isActive: true } });
  if (!c) throw AppError.unprocessable("The customer does not exist", [{ path: "customerId", message: "not found" }]);
  if (!c.isActive) throw AppError.unprocessable(`${c.code} is inactive`, [{ path: "customerId", message: "customer is inactive" }]);
  return c;
}

async function resolveLines(tx: Tx, companyId: string, lines: LineInput[], defaults: { locationId?: string; requiredDate: string }) {
  const problems: ErrorDetail[] = [];
  const [materials, locations] = await Promise.all([
    tx.material.findMany({ where: { companyId, id: { in: lines.map((l) => l.materialId) } }, select: { id: true, code: true, isActive: true } }),
    tx.location.findMany({
      where: { companyId, id: { in: lines.map((l) => l.locationId ?? defaults.locationId).filter(Boolean) as string[] } },
      select: { id: true, code: true, isActive: true },
    }),
  ]);
  const mById = new Map(materials.map((m) => [m.id, m]));
  const lById = new Map(locations.map((l) => [l.id, l]));
  const seen = new Set<string>();

  const resolved = lines.map((l, i) => {
    const m = mById.get(l.materialId);
    const locationId = l.locationId ?? defaults.locationId;
    const loc = locationId ? lById.get(locationId) : undefined;
    if (!m) problems.push({ path: `lines.${i}.materialId`, message: "not found" });
    else if (!m.isActive) problems.push({ path: `lines.${i}.materialId`, message: `${m.code} is inactive` });
    if (!locationId) problems.push({ path: `lines.${i}.locationId`, message: "is required when the order has no default location" });
    else if (!loc) problems.push({ path: `lines.${i}.locationId`, message: "not found" });
    else if (!loc.isActive) problems.push({ path: `lines.${i}.locationId`, message: `${loc.code} is inactive` });
    const key = `${l.materialId}|${locationId}`;
    if (seen.has(key)) problems.push({ path: `lines.${i}.materialId`, message: "appears on more than one line for the same location" });
    seen.add(key);

    return {
      lineNumber: i + 1,
      materialId: l.materialId,
      locationId: locationId!,
      quantity: new Prisma.Decimal(l.quantity),
      unitPrice: new Prisma.Decimal(l.unitPrice),
      lineTotal: lineTotal(l.quantity, l.unitPrice),
      requiredDate: dateOnly(l.requiredDate ?? defaults.requiredDate),
    };
  });

  if (problems.length) throw AppError.unprocessable("Some lines cannot be booked", problems);
  return resolved;
}

function assertDates(orderDate: string, requiredDate: string, lines: { requiredDate?: string }[] = []) {
  const problems: ErrorDetail[] = [];
  if (requiredDate < orderDate) problems.push({ path: "requiredDate", message: "cannot be before the order date" });
  lines.forEach((l, i) => {
    if (l.requiredDate && l.requiredDate < orderDate) problems.push({ path: `lines.${i}.requiredDate`, message: "cannot be before the order date" });
  });
  if (problems.length) throw AppError.unprocessable("The dates are inconsistent", problems);
}

async function lockSo(tx: Tx, companyId: string, id: string) {
  if (!(await lockRow(tx, "sales_orders", id, companyId))) throw AppError.notFound("Sales order", id);
  return tx.salesOrder.findUniqueOrThrow({
    where: { id },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          material: { select: { id: true, code: true, isBatchTracked: true } },
          location: { select: { id: true, code: true, isActive: true } },
        },
      },
    },
  });
}

/* ---- Book ------------------------------------------------------------------- */

export async function createSalesOrder(input: CreateSalesOrderInput, ctx: WriteContext): Promise<{ id: string; orderNumber: string }> {
  requirePermission(ctx.actor, "sales-order:create");
  const companyId = ctx.actor.companyId;

  return runInTransaction(async (tx) => {
    const company = await companyContext(companyId, tx);
    const orderDate = input.orderDate ?? company.today;
    assertDates(orderDate, input.requiredDate, input.lines);
    await resolveCustomer(tx, companyId, input.customerId);
    const lines = await resolveLines(tx, companyId, input.lines, { locationId: input.locationId, requiredDate: input.requiredDate });

    const orderNumber = await nextDocumentNumber(tx, companyId, "SALES_ORDER", yearOf(orderDate));
    const so = await tx.salesOrder.create({
      data: {
        companyId, orderNumber, customerId: input.customerId,
        orderDate: dateOnly(orderDate), requiredDate: dateOnly(input.requiredDate),
        status: SalesOrderStatus.CONFIRMED, deliveryStatus: DeliveryStatus.PENDING,
        totalAmount: orderTotal(lines.map((l) => ({ orderedQty: l.quantity, unitPrice: l.unitPrice }))),
        currencyCode: company.currencyCode, notes: input.notes ?? null,
        lines: { create: lines },
      },
      select: { id: true, totalAmount: true },
    });

    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CREATE, entityType: "sales_orders", entityId: so.id, entityLabel: orderNumber,
      newValues: {
        status: "CONFIRMED", customerId: input.customerId, orderDate, requiredDate: input.requiredDate,
        totalAmount: so.totalAmount.toString(),
        lines: lines.map((l) => ({ materialId: l.materialId, locationId: l.locationId, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString() })),
      },
    });
    return { id: so.id, orderNumber };
  });
}

/* ---- Edit (CONFIRMED, nothing shipped) --------------------------------------- */

export async function updateSalesOrder(id: string, input: UpdateSalesOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "sales-order:update");
  const companyId = ctx.actor.companyId;

  await runInTransaction(async (tx) => {
    const so = await lockSo(tx, companyId, id);
    assertSoTransition(so.status, "edit", so.orderNumber);
    if (so.lines.some((l) => l.shippedQty.gt(0))) {
      throw AppError.conflict(`${so.orderNumber} has already shipped stock; cancel the remainder and book a new order instead`);
    }

    const orderDate = input.orderDate ?? isoDate(so.orderDate);
    const requiredDate = input.requiredDate ?? isoDate(so.requiredDate);
    assertDates(orderDate, requiredDate, input.lines);
    if (input.customerId) await resolveCustomer(tx, companyId, input.customerId);

    let totalAmount: Prisma.Decimal | undefined;
    if (input.lines) {
      const lines = await resolveLines(tx, companyId, input.lines, { locationId: input.locationId, requiredDate });
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
      await tx.salesOrderLine.createMany({ data: lines.map((l) => ({ ...l, salesOrderId: id })) });
      totalAmount = orderTotal(lines.map((l) => ({ orderedQty: l.quantity, unitPrice: l.unitPrice })));
    }

    const data = {
      customerId: input.customerId,
      orderDate: input.orderDate ? dateOnly(input.orderDate) : undefined,
      requiredDate: input.requiredDate ? dateOnly(input.requiredDate) : undefined,
      notes: input.notes === undefined ? undefined : input.notes || null,
      totalAmount,
    };
    await tx.salesOrder.update({ where: { id }, data });

    const fmt = (x: unknown) => (x instanceof Date ? isoDate(x) : x == null ? null : String(x));
    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const before = (so as Record<string, unknown>)[k];
      if (fmt(before) !== fmt(v)) {
        previous[k] = fmt(before);
        next[k] = fmt(v);
      }
    }
    if (input.lines) next.lines = input.lines;
    if (Object.keys(next).length) {
      await recordAudit({
        ...auditMeta(ctx), tx,
        action: AuditAction.UPDATE, entityType: "sales_orders", entityId: id, entityLabel: so.orderNumber,
        previousValues: previous, newValues: next,
      });
    }
  });
}

/* ---- Cancel / deliver ---------------------------------------------------------- */

export async function cancelSalesOrder(id: string, input: CancelSalesOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "sales-order:update");
  await runInTransaction(async (tx) => {
    const so = await lockSo(tx, ctx.actor.companyId, id);
    assertSoTransition(so.status, "cancel", so.orderNumber);
    const note = `Cancelled ${new Date().toISOString().slice(0, 10)} by ${ctx.actor.name}: ${input.reason}`;
    await tx.salesOrder.update({
      where: { id },
      data: { status: SalesOrderStatus.CANCELLED, notes: so.notes ? `${so.notes}\n${note}` : note },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CANCEL, entityType: "sales_orders", entityId: id, entityLabel: so.orderNumber,
      previousValues: { status: so.status },
      newValues: {
        status: "CANCELLED", reason: input.reason,
        cancelledOpen: so.lines.map((l) => ({ lineId: l.id, qty: Prisma.Decimal.max(0, l.quantity.minus(l.shippedQty)).toString() })),
      },
    });
  });
}

export async function deliverSalesOrder(id: string, input: DeliverInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "sales-order:dispatch");
  await runInTransaction(async (tx) => {
    const so = await lockSo(tx, ctx.actor.companyId, id);
    assertSoTransition(so.status, "deliver", so.orderNumber);
    const { today } = await companyContext(ctx.actor.companyId, tx);
    const delivered = input.deliveredDate ?? today;
    if (delivered > today) throw AppError.unprocessable("Delivery cannot be dated in the future", [{ path: "deliveredDate", message: `is after today (${today})` }]);
    if (so.dispatchDate && delivered < isoDate(so.dispatchDate)) {
      throw AppError.unprocessable("Delivery is dated before dispatch", [{ path: "deliveredDate", message: `is before the dispatch date (${isoDate(so.dispatchDate)})` }]);
    }
    await tx.salesOrder.update({ where: { id }, data: { status: SalesOrderStatus.DELIVERED, deliveryStatus: DeliveryStatus.DELIVERED } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "sales_orders", entityId: id, entityLabel: so.orderNumber,
      previousValues: { status: so.status, deliveryStatus: so.deliveryStatus },
      newValues: { status: "DELIVERED", deliveryStatus: "DELIVERED", deliveredDate: delivered },
    });
  });
}

/* ---- Dispatch ------------------------------------------------------------------ */

export interface DispatchResult {
  salesOrder: { id: string; orderNumber: string; status: SalesOrderStatus };
  dispatchDate: string;
  lines: {
    lineNumber: number;
    materialCode: string;
    quantity: number;
    shippedQty: number;
    lots: { lotId: string; lotNumber: string; quantity: number }[];
  }[];
}

/**
 * Ship stock against an order.
 *
 * Batch-tracked lines ship from lots: the ones named, or first-expiry-first-
 * out when none are. Only released (APPROVED), unexpired lots at the line's
 * location can ship. Each lot draw is an ISSUE movement referencing the
 * order line, which is exactly what forward traceability reads.
 *
 * Runs in the caller's transaction so the route can make it idempotent.
 */
export async function dispatchSalesOrder(tx: Tx, id: string, input: DispatchInput, ctx: WriteContext): Promise<DispatchResult> {
  requirePermission(ctx.actor, "sales-order:dispatch");
  const companyId = ctx.actor.companyId;
  const company = await companyContext(companyId, tx);
  const dispatchDate = input.dispatchDate ?? company.today;
  if (dispatchDate > company.today) {
    throw AppError.unprocessable("A dispatch cannot be dated in the future", [{ path: "dispatchDate", message: `is after today (${company.today})` }]);
  }

  const so = await lockSo(tx, companyId, id);
  assertSoTransition(so.status, "dispatch", so.orderNumber);
  if (dispatchDate < isoDate(so.orderDate)) {
    throw AppError.unprocessable("The dispatch is dated before the order", [{ path: "dispatchDate", message: `is before the order date (${isoDate(so.orderDate)})` }]);
  }

  const tolerance = await getSetting(companyId, "sales.overDispatchTolerancePct", tx);
  const planned = planDispatch(
    so.lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber, quantity: l.quantity, shippedQty: l.shippedQty, materialCode: l.material.code })),
    // Schema-validated; the cast bridges zod's optionals under non-strict TS.
    input.lines as DispatchLineInput[],
    tolerance,
  );
  const lineById = new Map(so.lines.map((l) => [l.id, l]));

  const inactive = planned.map((p) => lineById.get(p.line.id)!).find((l) => !l.location.isActive);
  if (inactive) throw AppError.unprocessable(`${inactive.location.code} is inactive; nothing can ship from it`);

  // Balances before lots, per the system-wide lock order.
  const locked = await lockBalances(tx, planned.map((p) => {
    const l = lineById.get(p.line.id)!;
    return { materialId: l.materialId, locationId: l.locationId };
  }));

  const occurredAt = dispatchDate === company.today ? new Date() : dateOnly(dispatchDate);
  const result: DispatchResult["lines"] = [];
  const problems: ErrorDetail[] = [];

  for (const [i, p] of planned.entries()) {
    const line = lineById.get(p.line.id)!;
    let draws: { lotId: string | null; lotNumber: string | null; quantity: Prisma.Decimal }[];

    if (line.material.isBatchTracked) {
      const candidates: CandidateLot[] = (await tx.inventoryLot.findMany({
        where: {
          materialId: line.materialId, locationId: line.locationId,
          ...(p.input.lots?.length ? { id: { in: p.input.lots.map((x) => x.lotId) } } : { remainingQty: { gt: 0 }, qcStatus: "APPROVED" }),
        },
        select: { id: true, lotNumber: true, remainingQty: true, qcStatus: true, expiryDate: true, receiptDate: true },
      })).map((l) => ({ ...l, expiryDate: l.expiryDate ? isoDate(l.expiryDate) : null, receiptDate: isoDate(l.receiptDate) }));

      if (p.input.lots?.length) {
        const byId = new Map(candidates.map((c) => [c.id, c]));
        draws = [];
        for (const [j, x] of p.input.lots.entries()) {
          const lot = byId.get(x.lotId);
          const path = `lines.${i}.lots.${j}`;
          if (!lot) { problems.push({ path: `${path}.lotId`, message: `is not a ${line.material.code} lot at ${line.location.code}` }); continue; }
          const why = lotShippable(lot, dispatchDate);
          if (why) { problems.push({ path: `${path}.lotId`, message: why }); continue; }
          if (new Prisma.Decimal(x.quantity).gt(lot.remainingQty)) {
            problems.push({ path: `${path}.quantity`, message: `lot ${lot.lotNumber} has ${lot.remainingQty} remaining` });
            continue;
          }
          draws.push({ lotId: lot.id, lotNumber: lot.lotNumber, quantity: new Prisma.Decimal(x.quantity) });
        }
        if (problems.length) continue;
      } else {
        try {
          draws = allocateFefo(candidates, p.quantity, dispatchDate, line.material.code);
        } catch (e) {
          if (AppError.is(e)) { problems.push({ path: `lines.${i}.quantity`, message: e.message }); continue; }
          throw e;
        }
      }
    } else {
      if (p.input.lots?.length) { problems.push({ path: `lines.${i}.lots`, message: `${line.material.code} is not batch tracked` }); continue; }
      draws = [{ lotId: null, lotNumber: null, quantity: p.quantity }];
    }

    for (const d of draws) {
      await postMovement(tx, {
        materialId: line.materialId, locationId: line.locationId, lotId: d.lotId,
        type: StockMovementType.ISSUE, quantity: d.quantity.negated(), bucket: "UNRESTRICTED",
        referenceType: MOVEMENT_REF.SALES_ORDER_LINE, referenceId: line.id,
        occurredAt, notes: `Dispatch against ${so.orderNumber}`, postedById: ctx.actor.userId, label: line.material.code,
      }, locked);
    }
    await tx.salesOrderLine.update({ where: { id: line.id }, data: { shippedQty: p.shippedAfter } });

    result.push({
      lineNumber: line.lineNumber, materialCode: line.material.code,
      quantity: p.quantity.toNumber(), shippedQty: p.shippedAfter.toNumber(),
      lots: draws.filter((d) => d.lotId).map((d) => ({ lotId: d.lotId!, lotNumber: d.lotNumber!, quantity: d.quantity.toNumber() })),
    });
  }

  if (problems.length) throw AppError.unprocessable("The dispatch cannot be posted", problems);

  const shippedAfter = new Map(planned.map((p) => [p.line.id, p.shippedAfter]));
  const status = statusAfterDispatch(so.lines.map((l) => ({ quantity: l.quantity, shippedQty: shippedAfter.get(l.id) ?? l.shippedQty })));
  await tx.salesOrder.update({
    where: { id },
    data: {
      status,
      deliveryStatus: status === "DISPATCHED" ? DeliveryStatus.IN_TRANSIT : so.deliveryStatus,
      dispatchDate: dateOnly(dispatchDate),
      invoiceNumber: input.invoiceNumber ?? so.invoiceNumber,
    },
  });

  await recordAudit({
    ...auditMeta(ctx), tx,
    action: AuditAction.DISPATCH, entityType: "sales_orders", entityId: so.id, entityLabel: so.orderNumber,
    previousValues: { status: so.status },
    newValues: {
      status, dispatchDate, invoiceNumber: input.invoiceNumber ?? null, notes: input.notes ?? null,
      lines: result.map((r) => ({ line: r.lineNumber, material: r.materialCode, quantity: r.quantity, lots: r.lots.map((l) => `${l.lotNumber}:${l.quantity}`) })),
    },
  });

  return { salesOrder: { id: so.id, orderNumber: so.orderNumber, status }, dispatchDate, lines: result };
}
