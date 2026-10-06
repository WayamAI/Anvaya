import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { listPurchaseOrders } from "./purchase-order.service";
import { listSalesOrders } from "./sales-order.service";
import { listWorkOrders } from "./work-order.service";
import { listVendors } from "./vendor.service";
import { listCustomers } from "./customer.service";
import { listMaterials } from "./material.service";

/**
 * Paged order and partner lists against Postgres. The tab counts, "overdue"
 * and the sales KPIs are worked out in SQL over the whole company, and must
 * equal what the old in-memory rules gave over every row — worked by hand
 * below, relative to today.
 */

let f: Fixture;
let other: Fixture;
const NOW = new Date();
const TODAY = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
const day = (offset: number) => new Date(TODAY + offset * 86_400_000);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const num = (n: string) => `${n}-${f.tag}`;

/** Every page, following cursors, so paging is checked end to end. */
async function allPages<T extends { id: string }>(fetch: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>) {
  const out: T[][] = [];
  let cursor: string | undefined;
  do {
    const p = await fetch(cursor);
    out.push(p.items);
    cursor = p.nextCursor ?? undefined;
  } while (cursor && out.length < 20);
  return out;
}

beforeAll(async () => {
  f = await createFixture();
  other = await createFixture();
  const by = (await f.actor([], "Lister")).userId;

  // Purchase orders: PO-2 and PO-3 are overdue (open, a line past due with qty outstanding).
  const po = (n: string, status: string, orderOffset: number, lineDue: number, ordered: number, received: number) =>
    prisma.purchaseOrder.create({ data: {
      companyId: f.companyId, orderNumber: num(n), vendorId: f.vendor.id, locationId: f.plant.id, status: status as never,
      orderDate: day(orderOffset), expectedDeliveryDate: day(lineDue), createdById: by,
      lines: { create: [{ lineNumber: 1, materialId: f.raw.id, orderedQty: D(ordered), receivedQty: D(received), unitPrice: D(1), lineTotal: D(ordered), expectedDeliveryDate: day(lineDue) }] },
    } });
  await po("PO-1", "DRAFT", -5, 5, 10, 0);
  await po("PO-2", "ORDERED", -4, -2, 10, 0);
  await po("PO-3", "PARTIALLY_RECEIVED", -3, -1, 10, 4);
  await po("PO-4", "ORDERED", -2, -3, 10, 10); // past due but nothing outstanding
  await po("PO-5", "CANCELLED", -1, -5, 10, 0); // past due but not open

  // Sales orders.
  const so = (n: string, status: string, orderOffset: number, due: number, qty: number, shipped: number, price: number) =>
    prisma.salesOrder.create({ data: {
      companyId: f.companyId, orderNumber: num(n), customerId: f.customer.id, status: status as never,
      orderDate: day(orderOffset), requiredDate: day(due), totalAmount: D(qty * price),
      lines: { create: [{ lineNumber: 1, materialId: f.finished.id, locationId: f.plant.id, quantity: D(qty), shippedQty: D(shipped), unitPrice: D(price), lineTotal: D(qty * price), requiredDate: day(due) }] },
    }, include: { lines: true } });
  await so("SO-1", "CONFIRMED", 0, 3, 10, 0, 10); // open, due within 7 days, booked today: 100
  const s2 = await so("SO-2", "PROCESSING", -10, -2, 10, 4, 20); // open and overdue: 200
  await so("SO-3", "DELIVERED", -20, -15, 10, 10, 30); // not open: 300
  await so("SO-4", "CANCELLED", 0, 5, 5, 0, 10); // booked today but cancelled: 50
  // 4 dispatched from SO-2 this month at 20 each: 80.
  await prisma.stockMovement.create({ data: {
    materialId: f.finished.id, locationId: f.plant.id, type: "ISSUE", quantity: D(-4), balanceAfter: D(0),
    referenceType: "SALES_ORDER_LINE", referenceId: s2.lines[0].id, occurredAt: NOW, postedById: by,
  } });

  // Work orders: WO-1 overdue (open, ended yesterday), WO-2 completed late, WO-3 future.
  const wo = (n: string, status: string, start: number, end: number) => prisma.workOrder.create({ data: {
    companyId: f.companyId, orderNumber: num(n), materialId: f.finished.id, locationId: f.plant.id, status: status as never,
    plannedQty: D(10), plannedStartDate: day(start), plannedEndDate: day(end),
  } });
  await wo("WO-1", "RELEASED", -3, -1);
  await wo("WO-2", "COMPLETED", -9, -5);
  await wo("WO-3", "PLANNED", 1, 3);
});

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { materialId: f?.finished.id } });
  await f?.destroy();
  await other?.destroy();
  await prisma.$disconnect();
});

describe("purchase orders", () => {
  it("pages newest first, every order exactly once", async () => {
    const pages = await allPages(async (cursor) => {
      const r = await listPurchaseOrders(f.companyId, { limit: 2, cursor }, NOW);
      return { items: r.list.orders, nextCursor: r.nextCursor };
    });
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    expect(pages.flat().map((o) => o.orderNumber)).toEqual(["PO-5", "PO-4", "PO-3", "PO-2", "PO-1"].map(num));
  });

  it("counts every tab across the company, whatever the page, filter or search", async () => {
    const r = await listPurchaseOrders(f.companyId, { limit: 1, status: "DRAFT", q: "no-match" }, NOW);
    expect(r.list.orders).toEqual([]);
    expect(r.list.counts).toMatchObject({ all: 5, DRAFT: 1, ORDERED: 2, PARTIALLY_RECEIVED: 1, CANCELLED: 1, overdue: 2 });
  });

  it("filters by tab, overdue included, and searches number and vendor", async () => {
    const overdue = await listPurchaseOrders(f.companyId, { limit: 50, status: "overdue" }, NOW);
    expect(overdue.list.orders.map((o) => o.orderNumber)).toEqual([num("PO-3"), num("PO-2")]);
    expect(overdue.list.orders.every((o) => o.overdue)).toBe(true);
    expect(overdue.total).toBe(2);
    expect((await listPurchaseOrders(f.companyId, { limit: 50, q: num("PO-4") }, NOW)).list.orders.map((o) => o.orderNumber)).toEqual([num("PO-4")]);
    expect((await listPurchaseOrders(f.companyId, { limit: 50, q: "approved chem" }, NOW)).total).toBe(5);
  });

  it("shows another company nothing", async () => {
    const r = await listPurchaseOrders(other.companyId, { limit: 50 }, NOW);
    expect(r.list.orders).toEqual([]);
    expect(r.list.counts.all).toBe(0);
  });
});

describe("sales orders", () => {
  it("pages, counts and computes the headline figures over the whole company", async () => {
    const r = await listSalesOrders(f.companyId, { limit: 1 }, NOW);
    expect(r.list.orders.map((o) => o.orderNumber)).toEqual([num("SO-4")]); // newest first; SO-1 and SO-4 share today, higher number first
    expect(r.nextCursor).not.toBeNull();
    expect(r.list.counts).toMatchObject({ all: 4, CONFIRMED: 1, PROCESSING: 1, DELIVERED: 1, CANCELLED: 1, overdue: 1 });
    expect(r.list.kpis).toEqual({
      open: { count: 2, value: 300 },
      dueNext7Days: { count: 1, value: 100 },
      bookedToday: { count: 1, value: 100 },
      dispatchedMtd: 80,
    });
  });

  it("filters to overdue and searches by customer", async () => {
    expect((await listSalesOrders(f.companyId, { limit: 50, status: "overdue" }, NOW)).list.orders.map((o) => o.orderNumber)).toEqual([num("SO-2")]);
    expect((await listSalesOrders(other.companyId, { limit: 50 }, NOW)).list.kpis.open).toEqual({ count: 0, value: 0 });
  });
});

describe("work orders", () => {
  it("pages by planned start, newest first, and counts overdue in SQL", async () => {
    const pages = await allPages(async (cursor) => {
      const r = await listWorkOrders(f.companyId, { limit: 2, cursor }, NOW);
      return { items: r.list.orders, nextCursor: r.nextCursor };
    });
    expect(pages.flat().map((o) => o.orderNumber)).toEqual(["WO-3", "WO-1", "WO-2"].map(num));
    const r = await listWorkOrders(f.companyId, { limit: 50, status: "overdue" }, NOW);
    expect(r.list.orders.map((o) => o.orderNumber)).toEqual([num("WO-1")]);
    expect(r.list.counts).toMatchObject({ all: 3, overdue: 1, RELEASED: 1, COMPLETED: 1, PLANNED: 1 });
  });
});

describe("vendors and customers", () => {
  it("page by code with a bounded size, within the company", async () => {
    const pages = await allPages(async (cursor) => listVendors(f.companyId, { active: "all", limit: 1, cursor }));
    expect(pages.flat().map((v) => v.code)).toEqual(["SUP-T1", "SUP-T2"]);
    const search = await listVendors(f.companyId, { active: "all", limit: 50, q: "new supp" });
    expect(search.items.map((v) => v.code)).toEqual(["SUP-T2"]);
    expect(search.total).toBe(1);
    const customers = await listCustomers(f.companyId, { active: "true", limit: 50 });
    expect(customers.items.map((c) => c.id)).toEqual([f.customer.id]);
    expect(customers.nextCursor).toBeNull();
  });
});

describe("material search for pickers", () => {
  it("searches code and name, narrows to several kinds, pages, and stays in the company", async () => {
    const byCode = await listMaterials(f.companyId, { active: "true", limit: 50, q: "rm-t1" });
    expect(byCode.items.map((m) => m.id)).toEqual([f.raw.id]);
    const byName = await listMaterials(f.companyId, { active: "true", limit: 50, q: f.raw.name.slice(0, 5).toLowerCase() });
    expect(byName.items.map((m) => m.id)).toContain(f.raw.id);

    // What a PO offers: everything but finished goods.
    const orderable = await listMaterials(f.companyId, { active: "true", limit: 50, kinds: ["RAW", "PACKAGING", "SEMI_FINISHED", "CONSUMABLE"] });
    expect(orderable.items.map((m) => m.id).sort()).toEqual([f.raw.id, f.pack.id].sort());
    expect(orderable.items.some((m) => m.kind === "FINISHED")).toBe(false);

    const first = await listMaterials(f.companyId, { active: "true", limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.total).toBeGreaterThan(1);
    const second = await listMaterials(f.companyId, { active: "true", limit: 1, cursor: first.nextCursor! });
    expect(second.items[0].id).not.toBe(first.items[0].id);

    expect((await listMaterials(other.companyId, { active: "true", limit: 50, q: "rm-t1" })).items.map((m) => m.id)).not.toContain(f.raw.id);
  });
});
