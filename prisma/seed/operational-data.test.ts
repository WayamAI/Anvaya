import { describe, it, expect } from "vitest";
import { MATERIALS, BOM_FG001 } from "./master-data";
import {
  AS_OF_DATE, BALANCES, LOTS, SALES_ORDERS, WORK_ORDERS,
  PRODUCED_LOTS, COMPONENT_LOTS, LOT_DISPATCHES, openingLots,
} from "./operational-data";

/**
 * The lot-traceability seed only links records that already exist. These
 * checks keep it that way: every link must agree with the order, lot and
 * material it points at, so a later edit to the dataset cannot leave the
 * trace describing something that did not happen.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const allLots = [...LOTS.map((l) => ({ lotNumber: l.lotNumber, material: l.material, receiptDate: l.receiptDate })),
  ...PRODUCED_LOTS.map((p) => ({ lotNumber: p.lotNumber, material: p.material, receiptDate: p.productionDate }))];

describe("produced lots", () => {
  it("come only from completed work orders, for the quantity they produced", () => {
    for (const p of PRODUCED_LOTS) {
      const wo = WORK_ORDERS.find((w) => w.orderNumber === p.workOrder);
      expect(wo, p.workOrder).toBeDefined();
      expect(wo!.status).toBe("COMPLETED");
      expect(p.material).toBe(wo!.material);
      expect(p.location).toBe(wo!.location);
      expect(p.quantity).toBe(wo!.producedQty);
    }
  });

  it("are dated within the order's window, before the as-of date", () => {
    for (const p of PRODUCED_LOTS) {
      const wo = WORK_ORDERS.find((w) => w.orderNumber === p.workOrder)!;
      expect(day(p.productionDate)).toBeGreaterThanOrEqual(day(wo.plannedStartDate));
      expect(day(p.productionDate)).toBeLessThanOrEqual(day(wo.plannedEndDate));
      expect(day(p.productionDate)).toBeLessThan(day(AS_OF_DATE));
    }
  });

  it("expire exactly one shelf life after production", () => {
    for (const p of PRODUCED_LOTS) {
      const shelf = MATERIALS.find((m) => m.code === p.material)!.shelfLifeDays!;
      expect((day(p.expiryDate) - day(p.productionDate)) / 86_400_000).toBe(shelf);
    }
  });

  it("do not reuse a lot number", () => {
    const numbers = allLots.map((l) => l.lotNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("component lot links", () => {
  it("point at a lot of the same material, received before the order started", () => {
    for (const c of COMPONENT_LOTS) {
      const lot = allLots.find((l) => l.lotNumber === c.lotNumber);
      const wo = WORK_ORDERS.find((w) => w.orderNumber === c.workOrder)!;
      expect(lot, c.lotNumber).toBeDefined();
      expect(lot!.material).toBe(c.material);
      expect(day(lot!.receiptDate)).toBeLessThanOrEqual(day(wo.plannedStartDate));
    }
  });

  it("only link components the order's BOM actually lists", () => {
    const components = new Set(BOM_FG001.components.map((c) => c.material));
    for (const c of COMPONENT_LOTS.filter((x) => x.workOrder === "WO-2026-0091")) {
      expect(components.has(c.material), c.material).toBe(true);
    }
  });
});

describe("lot dispatches", () => {
  it("match the shipped quantity and material of the sales order line", () => {
    for (const x of LOT_DISPATCHES) {
      const so = SALES_ORDERS.find((s) => s.orderNumber === x.salesOrder)!;
      const line = so.lines[x.lineNumber - 1];
      const lot = allLots.find((l) => l.lotNumber === x.lotNumber)!;
      expect(lot.material).toBe(line.material);
      const shipped = LOT_DISPATCHES.filter((y) => y.salesOrder === x.salesOrder && y.lineNumber === x.lineNumber)
        .reduce((s, y) => s + y.quantity, 0);
      expect(shipped).toBe(line.shippedQty);
    }
  });

  it("happen after the lot was produced, and never exceed it", () => {
    for (const p of PRODUCED_LOTS) {
      const out = LOT_DISPATCHES.filter((x) => x.lotNumber === p.lotNumber);
      for (const x of out) expect(day(x.dispatchDate)).toBeGreaterThanOrEqual(day(p.productionDate));
      expect(out.reduce((s, x) => s + x.quantity, 0)).toBeLessThanOrEqual(p.quantity);
    }
  });
});

describe("ledger consistency", () => {
  it("leaves a non-negative stock for every material and location the trace touches", () => {
    // Opening stock plus production minus dispatches must stay >= 0; the seed
    // derives the balance cache from exactly this sum.
    for (const p of PRODUCED_LOTS) {
      const opening = BALANCES.find((b) => b.material === p.material && b.location === p.location)?.onHandQty ?? 0;
      const out = LOT_DISPATCHES.filter((x) => x.lotNumber === p.lotNumber).reduce((s, x) => s + x.quantity, 0);
      expect(opening + p.quantity - out).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("sales orders", () => {
  it("are fully shipped once delivered, and not shipped at all while only confirmed", () => {
    for (const so of SALES_ORDERS) {
      for (const l of so.lines) {
        if (so.status === "DELIVERED") expect(l.shippedQty, so.orderNumber).toBe(l.quantity);
        if (so.status === "CONFIRMED") expect(l.shippedQty, so.orderNumber).toBe(0);
      }
    }
  });

  it("are booked on or before the as-of date, and required no earlier than booked", () => {
    for (const so of SALES_ORDERS) {
      expect(day(so.orderDate), so.orderNumber).toBeLessThanOrEqual(day(AS_OF_DATE));
      expect(day(so.requiredDate), so.orderNumber).toBeGreaterThanOrEqual(day(so.orderDate));
    }
  });

  it("do not reuse an order number", () => {
    const numbers = SALES_ORDERS.map((so) => so.orderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("opening lots", () => {
  const materials = [
    { code: "RM-A", isBatchTracked: true, shelfLifeDays: 365 },
    { code: "RM-B", isBatchTracked: true },
    { code: "PM-C", isBatchTracked: false },
  ];
  const balances = [
    { material: "RM-A", location: "PUNE", onHandQty: 1000 },
    { material: "RM-A", location: "MUMBAI", onHandQty: 50 },
    { material: "RM-B", location: "PUNE", onHandQty: 200 },
    { material: "PM-C", location: "PUNE", onHandQty: 900 },
  ];
  const held = [
    { material: "RM-A", location: "PUNE", receivedQty: 800, consumedQty: 100 },
    { material: "RM-B", location: "PUNE", receivedQty: 300, consumedQty: 100 },
  ];
  const lots = openingLots(balances, held, materials);

  it("holds the rest of each batch-tracked balance in one released lot", () => {
    expect(lots.map((l) => [l.lotNumber, l.receivedQty])).toEqual([["OPN-RM-A-PUNE", 300], ["OPN-RM-A-MUMBAI", 50]]);
    expect(lots.every((l) => l.qcStatus === "APPROVED" && l.consumedQty === 0)).toBe(true);
  });

  it("adds nothing where lots already hold the balance, or for untracked materials", () => {
    expect(lots.some((l) => l.material === "RM-B" || l.material === "PM-C")).toBe(false);
  });

  it("expires the lot after the material's shelf life, from a receipt before the as-of date", () => {
    const [l] = lots;
    expect(l.receiptDate < AS_OF_DATE).toBe(true);
    expect(Date.parse(l.expiryDate!) - Date.parse(l.receiptDate)).toBe(365 * 86_400_000);
  });
});
