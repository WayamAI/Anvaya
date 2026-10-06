import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * What MRP reads as its snapshot: the queries run against a fake
 * transaction that applies the same filters Postgres would, so these tests
 * check which rows the plan sees, not how the calls were spelled.
 */

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:55432/anvaya?schema=public";
});

const D = (n: number) => new Prisma.Decimal(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Row = Record<string, unknown>;
const data: Record<string, Row[]> = {};
const lotWheres: Row[] = [];
const soWheres: Row[] = [];

/** The subset of Prisma's filter language the snapshot uses on these two tables. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR") return (cond as Row[]).some((c) => matches(row, c));
    if (k === "material" || k === "location") return true; // scoping, asserted separately
    if (k === "salesOrder") {
      const status = (row.salesOrder as Row).status as string;
      const c = cond as { status?: { in: string[] } };
      return !c.status || c.status.in.includes(status);
    }
    const v = row[k];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { lt?: Date; gte?: Date; lte?: Date; gt?: number };
      if (c.lt !== undefined && !(v instanceof Date && v < c.lt)) return false;
      if (c.gte !== undefined && !(v instanceof Date && v >= c.gte)) return false;
      if (c.lte !== undefined && !(v instanceof Date && v <= c.lte)) return false;
      if (c.gt !== undefined && !(v as Prisma.Decimal).gt(c.gt)) return false;
      return true;
    }
    return v === cond;
  });
}

const model = (name: string) => ({
  findMany: async ({ where = {} }: { where?: Row } = {}) => {
    if (name === "inventoryLot") lotWheres.push(where);
    if (name === "salesOrderLine") soWheres.push(where);
    const rows = data[name] ?? [];
    return name === "inventoryLot" || name === "salesOrderLine" ? rows.filter((r) => matches(r, where)) : rows;
  },
});

const tx = new Proxy({}, { get: (_t, name: string) => model(name) });
vi.mock("@/server/db/client", () => ({ prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } }));

import { loadSnapshot } from "./mrp-run.service";

const params = { asOf: "2026-04-01", horizonDays: 60, bucketSizeDays: 1, includeForecast: true, respectSafetyStock: true };

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
  lotWheres.length = 0;
  soWheres.length = 0;
  data.material = [
    { id: "RM", code: "RM", unitOfMeasureId: "kg", unitOfMeasure: { code: "kg" } },
    { id: "FG", code: "FG", unitOfMeasureId: "pcs", unitOfMeasure: { code: "pcs" } },
  ];
  data.location = [{ id: "PLANT", isManufacturing: true }];
});

describe("usable stock in the MRP snapshot", () => {
  it("leaves out released lots that have expired, as dispatch and issue do", async () => {
    data.inventoryBalance = [{ materialId: "RM", locationId: "PLANT", onHandQty: D(500), quarantineQty: D(100) }];
    data.inventoryLot = [
      // Released, expired the day before planning: on the books, unusable.
      { materialId: "RM", locationId: "PLANT", qcStatus: "APPROVED", remainingQty: D(150), expiryDate: day("2026-03-31") },
      // Expires on the planning date itself: still shippable that day.
      { materialId: "RM", locationId: "PLANT", qcStatus: "APPROVED", remainingQty: D(200), expiryDate: day("2026-04-01") },
      // Expired but already held by quality — counted in quarantineQty, not twice.
      { materialId: "RM", locationId: "PLANT", qcStatus: "QUARANTINE", remainingQty: D(100), expiryDate: day("2026-03-01") },
      // No shelf life.
      { materialId: "RM", locationId: "PLANT", qcStatus: "APPROVED", remainingQty: D(50), expiryDate: null },
    ];

    const { input } = await loadSnapshot("c1", params);

    expect(input.onHand).toEqual([{ materialId: "RM", locationId: "PLANT", qty: 250 }]);
    expect(lotWheres[0]).toMatchObject({ material: { companyId: "c1" } });
  });
});

describe("forecast consumption in the MRP snapshot", () => {
  const line = (id: string, status: string, requiredDate: string, quantity: number, shippedQty: number) => ({
    id, materialId: "FG", locationId: "PLANT", quantity: D(quantity), shippedQty: D(shippedQty),
    requiredDate: day(requiredDate), salesOrder: { orderNumber: `SO-${id}`, status },
  });

  it("consumes April's forecast with every order booked for April, shipped or not", async () => {
    data.forecastPeriod = [{
      id: "fp", periodStart: day("2026-04-01"), periodEnd: day("2026-04-30"), forecastQty: D(1000),
      forecast: { name: "FG plan", materialId: "FG", locationId: "PLANT" },
    }];
    data.salesOrderLine = [
      line("1", "DELIVERED", "2026-04-05", 600, 600), // shipped: consumes 600, no demand
      line("2", "PROCESSING", "2026-04-20", 300, 100), // consumes 300, 200 still to ship
      line("3", "CANCELLED", "2026-04-25", 500, 50), // only what shipped was sold: 50
      line("4", "DELIVERED", "2025-12-01", 900, 900), // long before the window
    ];

    const { input, forecastUse } = await loadSnapshot("c1", params);

    // 1000 − (600 + 300 + 50) = 50 still expected.
    expect(forecastUse[0]).toMatchObject({ consumedBySales: 950, netForecast: 50 });
    const sales = input.demand.filter((d) => d.sourceType === "SALES_ORDER");
    expect(sales.map((d) => [d.sourceId, d.qty])).toEqual([["2", 200]]);
    const forecast = input.demand.filter((d) => d.sourceType === "FORECAST").reduce((s, d) => s + d.qty, 0);
    expect(forecast).toBeCloseTo(50, 6);
    expect(soWheres[0]).toMatchObject({ salesOrder: { companyId: "c1" } });
  });
});

describe("stock awaiting inspection in the MRP snapshot", () => {
  it("is a conditional receipt on the planning date, never usable stock", async () => {
    // 300 on hand at the plant, all of it held by quality in three lots.
    data.inventoryBalance = [{ materialId: "RM", locationId: "PLANT", onHandQty: D(300), quarantineQty: D(300) }];
    data.inventoryLot = [
      // Awaiting inspection: expected to be released.
      { id: "lot-p", lotNumber: "RMB-1", materialId: "RM", locationId: "PLANT", qcStatus: "PENDING", remainingQty: D(120), expiryDate: day("2027-01-01") },
      // Put on hold for a reason: not expected.
      { id: "lot-q", lotNumber: "RMB-2", materialId: "RM", locationId: "PLANT", qcStatus: "QUARANTINE", remainingQty: D(100), expiryDate: null },
      // Awaiting inspection but already expired: could never be released for use.
      { id: "lot-x", lotNumber: "RMB-3", materialId: "RM", locationId: "PLANT", qcStatus: "PENDING", remainingQty: D(80), expiryDate: day("2026-03-01") },
    ];

    const { input } = await loadSnapshot("c1", params);

    expect(input.onHand).toEqual([]);
    expect(input.receipts).toEqual([{
      materialId: "RM", locationId: "PLANT", date: "2026-04-01", qty: 120,
      type: "QUALITY_INSPECTION", id: "lot-p", reference: "RMB-1 (awaiting QC)",
    }]);
    expect(lotWheres.every((w) => (w.material as Row).companyId === "c1")).toBe(true);
  });
});

describe("run settings in the MRP snapshot", () => {
  it("carries the company's reschedule-in tolerance to the engine", async () => {
    const { input } = await loadSnapshot("c1", { ...params, rescheduleInToleranceDays: 4 });
    expect(input.rescheduleInToleranceDays).toBe(4);
  });
});
