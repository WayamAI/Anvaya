import { AuditAction, Prisma, PurchaseOrderStatus } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requirePermission } from "@/server/auth/rbac";
import { companyContext, dateOnly, isoDate, yearOf } from "@/server/config/business-date";
import { getSetting } from "@/server/config/company-settings";
import { nextDocumentNumber } from "@/server/db/sequence";
import { lockRow, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import { amountProblems, assertPoTransition, duplicateLineProblems, lineTotal, orderTotal } from "@/server/purchasing/po-rules";
import type {
  CancelPurchaseOrderInput, CreatePurchaseOrderInput, UpdatePurchaseOrderInput,
} from "@/server/validation/purchasing";
import { auditMeta, type WriteContext } from "./write-context";

/**
 * Purchase orders — write side.
 *
 * Each operation is one transaction that locks the PO row first, so two
 * people approving, editing or cancelling the same order serialise and the
 * second sees the first's result (and usually a 409 naming the new status).
 * Every change is written to the audit trail inside the same transaction.
 *
 * References are resolved against the caller's company: a vendor, location
 * or material id from another tenant fails exactly like one that does not
 * exist.
 */

type LineInput = CreatePurchaseOrderInput["lines"][number];

interface ResolvedLine {
  lineNumber: number;
  materialId: string;
  orderedQty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  expectedDeliveryDate: Date;
}

async function resolveVendor(tx: Tx, companyId: string, vendorId: string) {
  const vendor = await tx.vendor.findFirst({
    where: { id: vendorId, companyId },
    select: { id: true, code: true, name: true, isActive: true, isApproved: true },
  });
  if (!vendor) throw AppError.unprocessable("The vendor does not exist", [{ path: "vendorId", message: "not found" }]);
  if (!vendor.isActive) {
    throw AppError.unprocessable(`${vendor.code} is inactive`, [{ path: "vendorId", message: "vendor is inactive" }]);
  }
  return vendor;
}

async function resolveLocation(tx: Tx, companyId: string, locationId: string) {
  const location = await tx.location.findFirst({ where: { id: locationId, companyId }, select: { id: true, code: true, isActive: true } });
  if (!location) throw AppError.unprocessable("The location does not exist", [{ path: "locationId", message: "not found" }]);
  if (!location.isActive) {
    throw AppError.unprocessable(`${location.code} is inactive`, [{ path: "locationId", message: "location is inactive" }]);
  }
  return location;
}

/**
 * Check every line's material and fill in prices: an explicit price wins,
 * else the vendor's price on file; a line with neither is refused rather
 * than silently ordered at zero.
 */
async function resolveLines(
  tx: Tx,
  companyId: string,
  vendorId: string,
  lines: LineInput[],
  headerExpected: string,
): Promise<ResolvedLine[]> {
  const materials = await tx.material.findMany({
    where: { companyId, id: { in: lines.map((l) => l.materialId) } },
    select: {
      id: true, code: true, isActive: true,
      vendorMaterials: { where: { vendorId, isActive: true }, select: { unitPrice: true } },
    },
  });
  const byId = new Map(materials.map((m) => [m.id, m]));
  // Schema-validated, so materialId is present; the cast only bridges zod's
  // inferred optionals under this repo's non-strict tsconfig.
  const problems: ErrorDetail[] = duplicateLineProblems(lines as { materialId: string; expectedDeliveryDate?: string }[], headerExpected);

  const resolved = lines.map((l, i): ResolvedLine | null => {
    const m = byId.get(l.materialId);
    if (!m) {
      problems.push({ path: `lines.${i}.materialId`, message: "not found" });
      return null;
    }
    if (!m.isActive) {
      problems.push({ path: `lines.${i}.materialId`, message: `${m.code} is inactive` });
      return null;
    }
    const price = l.unitPrice ?? m.vendorMaterials[0]?.unitPrice ?? null;
    if (price === null) {
      problems.push({ path: `lines.${i}.unitPrice`, message: `no price on file for ${m.code} from this vendor; enter one` });
      return null;
    }
    const expected = l.expectedDeliveryDate ?? headerExpected;
    return {
      lineNumber: i + 1,
      materialId: m.id,
      orderedQty: new Prisma.Decimal(l.orderedQty),
      unitPrice: new Prisma.Decimal(price),
      lineTotal: lineTotal(l.orderedQty, price),
      expectedDeliveryDate: dateOnly(expected),
    };
  });

  if (!problems.length) problems.push(...amountProblems(resolved as ResolvedLine[]));
  if (problems.length) throw AppError.unprocessable("Some lines cannot be ordered", problems);
  return resolved as ResolvedLine[];
}

function assertDates(orderDate: string, expected: string, lines: { expectedDeliveryDate?: string }[] = []) {
  const problems: ErrorDetail[] = [];
  if (expected < orderDate) problems.push({ path: "expectedDeliveryDate", message: "cannot be before the order date" });
  lines.forEach((l, i) => {
    if (l.expectedDeliveryDate && l.expectedDeliveryDate < orderDate) {
      problems.push({ path: `lines.${i}.expectedDeliveryDate`, message: "cannot be before the order date" });
    }
  });
  if (problems.length) throw AppError.unprocessable("The dates are inconsistent", problems);
}

/** Lock a PO in the caller's company and read what the transitions need. */
async function lockPo(tx: Tx, companyId: string, id: string) {
  if (!(await lockRow(tx, "purchase_orders", id, companyId))) throw AppError.notFound("Purchase order", id);
  return tx.purchaseOrder.findUniqueOrThrow({
    where: { id },
    include: {
      vendor: { select: { code: true, isActive: true, isApproved: true } },
      lines: { select: { id: true, orderedQty: true, receivedQty: true }, orderBy: { lineNumber: "asc" } },
      _count: { select: { goodsReceipts: true } },
    },
  });
}

/* ---- Create ------------------------------------------------------------- */

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, ctx: WriteContext): Promise<{ id: string; orderNumber: string }> {
  requirePermission(ctx.actor, "purchase-order:create");
  return runInTransaction((tx) => createPurchaseOrderTx(tx, input, ctx));
}

/** The same, inside the caller's transaction (MRP converts several at once). */
export async function createPurchaseOrderTx(tx: Tx, input: CreatePurchaseOrderInput, ctx: WriteContext): Promise<{ id: string; orderNumber: string }> {
  requirePermission(ctx.actor, "purchase-order:create");
  const companyId = ctx.actor.companyId;
  {
    const company = await companyContext(companyId, tx);
    const orderDate = input.orderDate ?? company.today;
    assertDates(orderDate, input.expectedDeliveryDate, input.lines);

    await resolveVendor(tx, companyId, input.vendorId);
    await resolveLocation(tx, companyId, input.locationId);
    const lines = await resolveLines(tx, companyId, input.vendorId, input.lines, input.expectedDeliveryDate);

    const orderNumber = await nextDocumentNumber(tx, companyId, "PURCHASE_ORDER", yearOf(orderDate));
    const po = await tx.purchaseOrder.create({
      data: {
        companyId,
        orderNumber,
        vendorId: input.vendorId,
        locationId: input.locationId,
        orderDate: dateOnly(orderDate),
        expectedDeliveryDate: dateOnly(input.expectedDeliveryDate),
        status: PurchaseOrderStatus.DRAFT,
        totalAmount: orderTotal(lines),
        currencyCode: company.currencyCode,
        createdById: ctx.actor.userId,
        notes: input.notes ?? null,
        lines: { create: lines },
      },
      select: { id: true, orderNumber: true, totalAmount: true },
    });

    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CREATE, entityType: "purchase_orders", entityId: po.id, entityLabel: orderNumber,
      newValues: {
        status: "DRAFT", vendorId: input.vendorId, locationId: input.locationId, orderDate,
        expectedDeliveryDate: input.expectedDeliveryDate, totalAmount: po.totalAmount.toString(),
        lines: lines.map((l) => ({ materialId: l.materialId, orderedQty: l.orderedQty.toString(), unitPrice: l.unitPrice.toString() })),
      },
    });

    return { id: po.id, orderNumber };
  }
}

/* ---- Edit (DRAFT only) --------------------------------------------------- */

export async function updatePurchaseOrder(id: string, input: UpdatePurchaseOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "purchase-order:update");
  const companyId = ctx.actor.companyId;

  await runInTransaction(async (tx) => {
    const po = await lockPo(tx, companyId, id);
    assertPoTransition(po.status, "edit", po.orderNumber);

    const vendorId = input.vendorId ?? po.vendorId;
    const orderDate = input.orderDate ?? isoDate(po.orderDate);
    const expected = input.expectedDeliveryDate ?? isoDate(po.expectedDeliveryDate);
    assertDates(orderDate, expected, input.lines);

    if (input.vendorId) await resolveVendor(tx, companyId, input.vendorId);
    if (input.locationId) await resolveLocation(tx, companyId, input.locationId);

    // Changing vendor re-prices nothing silently: lines are only re-resolved
    // when sent, so a vendor change without lines keeps the agreed prices.
    let totalAmount: Prisma.Decimal | undefined;
    if (input.lines) {
      const lines = await resolveLines(tx, companyId, vendorId, input.lines, expected);
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({ data: lines.map((l) => ({ ...l, purchaseOrderId: id })) });
      totalAmount = orderTotal(lines);
    }

    const data = {
      vendorId: input.vendorId,
      locationId: input.locationId,
      orderDate: input.orderDate ? dateOnly(input.orderDate) : undefined,
      expectedDeliveryDate: input.expectedDeliveryDate ? dateOnly(input.expectedDeliveryDate) : undefined,
      notes: input.notes === undefined ? undefined : input.notes || null,
      totalAmount,
    };
    await tx.purchaseOrder.update({ where: { id }, data });

    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      const before = (po as Record<string, unknown>)[k];
      const fmt = (x: unknown) => (x instanceof Date ? isoDate(x) : x === null ? null : String(x));
      if (fmt(before) !== fmt(v)) {
        previous[k] = fmt(before);
        next[k] = fmt(v);
      }
    }
    if (input.lines) next.lines = input.lines;

    if (Object.keys(next).length) {
      await recordAudit({
        ...auditMeta(ctx), tx,
        action: AuditAction.UPDATE, entityType: "purchase_orders", entityId: id, entityLabel: po.orderNumber,
        previousValues: previous, newValues: next,
      });
    }
  });
}

/* ---- Delete (DRAFT only) ------------------------------------------------- */

export async function deletePurchaseOrder(id: string, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "purchase-order:delete");
  await runInTransaction(async (tx) => {
    const po = await lockPo(tx, ctx.actor.companyId, id);
    assertPoTransition(po.status, "delete", po.orderNumber);
    await tx.purchaseOrder.delete({ where: { id } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.DELETE, entityType: "purchase_orders", entityId: id, entityLabel: po.orderNumber,
      previousValues: { status: po.status, vendorId: po.vendorId, totalAmount: po.totalAmount.toString() },
    });
  });
}

/* ---- Approve / send / cancel -------------------------------------------- */

export async function approvePurchaseOrder(id: string, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "purchase-order:approve");
  const companyId = ctx.actor.companyId;

  await runInTransaction(async (tx) => {
    const po = await lockPo(tx, companyId, id);
    assertPoTransition(po.status, "approve", po.orderNumber);

    if (po.createdById === ctx.actor.userId && !(await getSetting(companyId, "purchasing.allowSelfApproval", tx))) {
      throw AppError.forbidden(`${po.orderNumber} was raised by you; company policy requires another approver`);
    }
    if (!po.lines.length) throw AppError.unprocessable(`${po.orderNumber} has no lines to approve`);
    if (!po.vendor.isActive) throw AppError.unprocessable(`${po.vendor.code} is inactive; a PO cannot be approved to it`);
    if (!po.vendor.isApproved) {
      throw AppError.unprocessable(`${po.vendor.code} is not on the Approved Supplier List; approve the vendor before the order`);
    }

    const approvedAt = new Date();
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.APPROVED, approvedById: ctx.actor.userId, approvedAt },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.APPROVE, entityType: "purchase_orders", entityId: id, entityLabel: po.orderNumber,
      previousValues: { status: po.status }, newValues: { status: "APPROVED", approvedAt: approvedAt.toISOString() },
    });
  });
}

export async function sendPurchaseOrder(id: string, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "purchase-order:update");
  await runInTransaction(async (tx) => {
    const po = await lockPo(tx, ctx.actor.companyId, id);
    assertPoTransition(po.status, "send", po.orderNumber);
    await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.ORDERED } });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.UPDATE, entityType: "purchase_orders", entityId: id, entityLabel: po.orderNumber,
      previousValues: { status: po.status }, newValues: { status: "ORDERED" },
    });
  });
}

export async function cancelPurchaseOrder(id: string, input: CancelPurchaseOrderInput, ctx: WriteContext): Promise<void> {
  requirePermission(ctx.actor, "purchase-order:update");
  await runInTransaction(async (tx) => {
    const po = await lockPo(tx, ctx.actor.companyId, id);
    assertPoTransition(po.status, "cancel", po.orderNumber);

    const note = `Cancelled ${new Date().toISOString().slice(0, 10)} by ${ctx.actor.name}: ${input.reason}`;
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED, notes: po.notes ? `${po.notes}\n${note}` : note },
    });
    await recordAudit({
      ...auditMeta(ctx), tx,
      action: AuditAction.CANCEL, entityType: "purchase_orders", entityId: id, entityLabel: po.orderNumber,
      previousValues: { status: po.status },
      newValues: {
        status: "CANCELLED", reason: input.reason,
        // What was still to come when the remainder was cancelled.
        cancelledOutstanding: po.lines.map((l) => ({
          lineId: l.id, qty: Prisma.Decimal.max(0, l.orderedQty.minus(l.receivedQty)).toString(),
        })),
      },
    });
  });
}
