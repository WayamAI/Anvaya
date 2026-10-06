import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { getSetting } from "@/server/config/company-settings";
import { todayIn } from "@/server/config/business-date";
import { addDays } from "@/server/planning/dates";
import { createFixture, type Fixture } from "@/test/integration/fixtures";
import { resolveException, startMrpRun } from "./mrp-run.service";
import { getRun, listExceptions, listPlannedOrders, pageExceptions, pageRuns } from "./mrp-read.service";
import { updateSettings } from "./master-data.service";

/**
 * Late open supply against Postgres. 100 RM-T1 is needed on day +30; PO
 * RESCH-1 brings 100 on day +32. Rescheduling is off unless the company turns
 * it on; with a 3-day tolerance the PO is expedited, not duplicated, and with
 * a 1-day tolerance MRP orders anew.
 */

let f: Fixture;
let planner: Awaited<ReturnType<Fixture["actor"]>>;
let admin: Awaited<ReturnType<Fixture["actor"]>>;
let today: string;
let poLineId: string;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = () => startMrpRun({ horizonDays: 60, bucketSizeDays: 1, includeForecast: false, respectSafetyStock: true, simulation: false, asOfDate: today }, f.ctx(planner));

beforeAll(async () => {
  f = await createFixture();
  today = todayIn("Asia/Kolkata");
  planner = await f.actor(["mrp:read", "mrp:run"], "Planner");
  admin = await f.actor(["setting:update", "setting:read"], "Admin");
  await prisma.materialLocationPolicy.create({ data: { materialId: f.raw.id, locationId: f.plant.id, procurementType: "BUY" } });
  await prisma.salesOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `SO-RS-${f.tag}`, customerId: f.customer.id, orderDate: day(today), requiredDate: day(addDays(today, 30)),
      lines: { create: [{ lineNumber: 1, materialId: f.raw.id, locationId: f.plant.id, quantity: D(100), unitPrice: D(50), requiredDate: day(addDays(today, 30)) }] },
    },
  });
  const po = await prisma.purchaseOrder.create({
    data: {
      companyId: f.companyId, orderNumber: `RESCH-1-${f.tag}`, vendorId: f.vendor.id, locationId: f.plant.id, status: "ORDERED",
      orderDate: day(today), expectedDeliveryDate: day(addDays(today, 32)), createdById: planner.userId,
      lines: { create: [{ lineNumber: 1, materialId: f.raw.id, orderedQty: D(100), unitPrice: D(12), lineTotal: D(1200), expectedDeliveryDate: day(addDays(today, 32)) }] },
    },
    include: { lines: true },
  });
  poLineId = po.lines[0].id;
});

afterAll(async () => {
  await f?.destroy();
  await prisma.$disconnect();
});

describe("late open supply", () => {
  it("is ordered as before while the company has not turned rescheduling on", async () => {
    expect(await getSetting(f.companyId, "mrp.rescheduleInToleranceDays")).toBe(0);
    const r = await run();
    expect((await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE" })).map((o) => o.quantity)).toEqual([100]);
    expect((await listExceptions(f.companyId, r.id)).some((e) => e.type === "RESCHEDULE_IN")).toBe(false);
  });

  it("is expedited within the company's tolerance, not ordered twice", async () => {
    await updateSettings({ "mrp.rescheduleInToleranceDays": 3 }, f.ctx(admin));
    const r = await run();
    expect(await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE" })).toEqual([]);
    const resched = (await listExceptions(f.companyId, r.id)).filter((e) => e.type === "RESCHEDULE_IN");
    expect(resched).toEqual([expect.objectContaining({ referenceId: poLineId, dueDate: addDays(today, 30), daysLate: 2, quantity: 100 })]);
    // The run records the tolerance it used.
    expect((await getRun(f.companyId, r.id)).parameters).toMatchObject({ rescheduleInToleranceDays: 3 });
  });

  it("is left alone, and new supply planned, beyond a tighter tolerance", async () => {
    await updateSettings({ "mrp.rescheduleInToleranceDays": 1 }, f.ctx(admin));
    const r = await run();
    const orders = await listPlannedOrders(f.companyId, r.id, { type: "PURCHASE" });
    expect(orders.map((o) => `${o.quantity}@${o.requiredDate}`)).toEqual([`100@${addDays(today, 30)}`]);
    expect((await listExceptions(f.companyId, r.id)).some((e) => e.type === "RESCHEDULE_IN")).toBe(false);
  });

  it("keeps the setting to its own company", async () => {
    const other = await createFixture();
    try {
      // This company now has 1; a new one is still off.
      expect(await getSetting(other.companyId, "mrp.rescheduleInToleranceDays")).toBe(0);
    } finally {
      await other.destroy();
    }
  });
});

describe("exceptions across runs", () => {
  it("belong to their run: the latest shows only current ones, earlier runs keep their history", async () => {
    // Rescheduling is at 1 day from the test above, so PO RESCH-1 is reported late each run.
    const first = await run();
    const before = await listExceptions(f.companyId, first.id);
    expect(before.length).toBeGreaterThan(0);
    await resolveException(before[0].id, f.ctx(planner));

    const second = await run();
    const third = await run();
    const latest = await listExceptions(f.companyId, "latest");
    // The same conditions, once each — not accumulated across three runs.
    expect(latest.map((e) => `${e.type}|${e.referenceId}`).sort()).toEqual(before.map((e) => `${e.type}|${e.referenceId}`).sort());
    expect(new Set(latest.map((e) => e.id)).size).toBe(latest.length);
    const thirdIds = new Set((await listExceptions(f.companyId, third.id)).map((e) => e.id));
    expect(latest.every((e) => thirdIds.has(e.id))).toBe(true);
    // A condition that persists is open again in the new run; the resolution stays on the run it was made in.
    expect(latest.every((e) => !e.isResolved)).toBe(true);
    expect((await listExceptions(f.companyId, first.id)).find((e) => e.id === before[0].id)!.isResolved).toBe(true);
    expect(second.id).not.toBe(third.id);
  });
});

describe("paging a run's exceptions and the run history", () => {
  it("pages exceptions open first, then by severity, each exactly once", async () => {
    const all = await listExceptions(f.companyId, "latest");
    const seen: typeof all = [];
    let cursor: string | undefined;
    do {
      const p = await pageExceptions(f.companyId, "latest", { limit: 1, cursor });
      expect(p.total).toBe(all.length);
      seen.push(...p.items);
      cursor = p.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.map((e) => e.id)).toEqual(all.map((e) => e.id));
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    const keys = seen.map((e) => [Number(e.isResolved), rank[e.severity]]);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });

  it("pages the run history newest first", async () => {
    const first = await pageRuns(f.companyId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await pageRuns(f.companyId, { limit: 2, cursor: first.nextCursor! });
    expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(first.items.length + second.items.length);
    expect(first.items[0].startedAt! >= second.items[0].startedAt!).toBe(true);
  });
});
