import { describe, it, expect } from "vitest";
import {
  SO_STATUSES, isOpenSo, isAwaitingDispatch, openQty, availableQty, isSoLineOverdue, isSoOverdue, soCounts, soKpis,
  type SoLineFacts,
} from "./sales-orders";

const AS_OF = new Date("2026-03-25T00:00:00Z");
const line = (over: Partial<SoLineFacts> = {}): SoLineFacts => ({
  quantity: 500, shippedQty: 0, requiredDate: "2026-04-02", ...over,
});

describe("status rules", () => {
  it("treats everything short of delivered or cancelled as open", () => {
    expect(SO_STATUSES.filter(isOpenSo)).toEqual(["CONFIRMED", "PROCESSING", "DISPATCHED"]);
  });

  it("stops awaiting dispatch once the order has shipped", () => {
    expect(SO_STATUSES.filter(isAwaitingDispatch)).toEqual(["CONFIRMED", "PROCESSING"]);
  });
});

describe("openQty", () => {
  it("is ordered less shipped, never negative", () => {
    expect(openQty(500, 200)).toBe(300);
    expect(openQty(240, 260)).toBe(0);
    expect(openQty(0.3, 0.1)).toBe(0.2);
  });
});

describe("availableQty", () => {
  it("is on hand less what is reserved or held by quality", () => {
    expect(availableQty(1000, 200, 100)).toBe(700);
  });

  it("never goes negative when commitments exceed stock", () => {
    expect(availableQty(100, 150, 0)).toBe(0);
  });
});

describe("isSoLineOverdue", () => {
  it("is a line past its required date with quantity still to ship", () => {
    expect(isSoLineOverdue(line({ requiredDate: "2026-03-24" }), AS_OF)).toBe(true);
  });

  it("is not overdue on the required date itself", () => {
    expect(isSoLineOverdue(line({ requiredDate: "2026-03-25" }), new Date("2026-03-25T18:00:00Z"))).toBe(false);
  });

  it("is not overdue once fully shipped", () => {
    expect(isSoLineOverdue(line({ requiredDate: "2026-03-20", shippedQty: 500 }), AS_OF)).toBe(false);
  });
});

describe("isSoOverdue", () => {
  const late = line({ requiredDate: "2026-03-20" });

  it("flags an order still awaiting dispatch with a late line", () => {
    expect(isSoOverdue("CONFIRMED", [line(), late], AS_OF)).toBe(true);
    expect(isSoOverdue("PROCESSING", [late], AS_OF)).toBe(true);
  });

  it("never flags an order that has shipped, been delivered or been cancelled", () => {
    for (const s of ["DISPATCHED", "DELIVERED", "CANCELLED"] as const) expect(isSoOverdue(s, [late], AS_OF)).toBe(false);
  });

  it("is false when every line is on time", () => {
    expect(isSoOverdue("CONFIRMED", [line()], AS_OF)).toBe(false);
  });
});

describe("soCounts", () => {
  it("counts every status, the total and the overdue ones", () => {
    const counts = soCounts([
      { status: "CONFIRMED", overdue: true },
      { status: "CONFIRMED", overdue: false },
      { status: "DELIVERED", overdue: false },
    ]);
    expect(counts).toEqual({ all: 3, overdue: 1, CONFIRMED: 2, PROCESSING: 0, DISPATCHED: 0, DELIVERED: 1, CANCELLED: 0 });
  });
});

describe("soKpis", () => {
  const order = (over: Partial<Parameters<typeof soKpis>[0]["orders"][number]> = {}) => ({
    status: "CONFIRMED" as const, orderDate: "2026-03-21", requiredDate: "2026-04-02", totalAmount: 100, ...over,
  });

  it("totals open orders by count and value", () => {
    const k = soKpis({
      orders: [order({ totalAmount: 100 }), order({ status: "DISPATCHED", totalAmount: 50 }), order({ status: "DELIVERED", totalAmount: 999 }), order({ status: "CANCELLED", totalAmount: 7 })],
      dispatches: [], asOf: AS_OF,
    });
    expect(k.open).toEqual({ count: 2, value: 150 });
  });

  it("counts orders awaiting dispatch due within the next seven days, inclusive", () => {
    const k = soKpis({
      orders: [
        order({ requiredDate: "2026-03-25", totalAmount: 10 }), // today
        order({ requiredDate: "2026-04-01", totalAmount: 20 }), // day 7
        order({ requiredDate: "2026-04-02", totalAmount: 40 }), // day 8 — outside
        order({ requiredDate: "2026-03-24", totalAmount: 80 }), // already overdue — not "due"
        order({ requiredDate: "2026-03-26", status: "DISPATCHED", totalAmount: 160 }), // shipped
      ],
      dispatches: [], asOf: AS_OF,
    });
    expect(k.dueNext7Days).toEqual({ count: 2, value: 30 });
  });

  it("counts orders booked on the as-of day, ignoring cancelled ones", () => {
    const k = soKpis({
      orders: [order({ orderDate: "2026-03-25", totalAmount: 5 }), order({ orderDate: "2026-03-25", status: "CANCELLED", totalAmount: 9 }), order({ orderDate: "2026-03-24" })],
      dispatches: [], asOf: AS_OF,
    });
    expect(k.bookedToday).toEqual({ count: 1, value: 5 });
  });

  it("values dispatches from the start of the month up to the as-of day", () => {
    const k = soKpis({
      orders: [],
      dispatches: [
        { occurredAt: "2026-03-24T00:00:00.000Z", quantity: 240, unitPrice: 890 },
        { occurredAt: "2026-03-01T00:00:00.000Z", quantity: 10, unitPrice: 100 },
        { occurredAt: "2026-02-28T23:00:00.000Z", quantity: 1, unitPrice: 5000 }, // last month
        { occurredAt: "2026-03-26T00:00:00.000Z", quantity: 1, unitPrice: 7000 }, // after as-of
      ],
      asOf: AS_OF,
    });
    expect(k.dispatchedMtd).toBe(214600);
  });

  it("counts a dispatch later on the as-of day itself", () => {
    const k = soKpis({ orders: [], dispatches: [{ occurredAt: "2026-03-25T17:30:00.000Z", quantity: 2, unitPrice: 10 }], asOf: AS_OF });
    expect(k.dispatchedMtd).toBe(20);
  });
});
