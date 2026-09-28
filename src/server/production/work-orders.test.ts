import { describe, it, expect } from "vitest";
import {
  isOpen, hasStarted, isOverdue, traceCompleteness, statusCounts, workCentreRoute, componentReadiness,
  WORK_ORDER_STATUSES,
} from "./work-orders";

const AS_OF = new Date("2026-09-24T15:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("status rules", () => {
  it("treats completed, closed and cancelled orders as finished", () => {
    expect(WORK_ORDER_STATUSES.filter(isOpen)).toEqual(["PLANNED", "FIRMED", "RELEASED", "IN_PROGRESS"]);
  });

  it("counts production as started from IN_PROGRESS on", () => {
    expect(WORK_ORDER_STATUSES.filter(hasStarted)).toEqual(["IN_PROGRESS", "COMPLETED", "CLOSED"]);
  });
});

describe("isOverdue", () => {
  it("is an open order past its planned end date", () => {
    expect(isOverdue("RELEASED", day("2026-03-27"), AS_OF)).toBe(true);
    expect(isOverdue("FIRMED", day("2026-09-23"), AS_OF)).toBe(true);
  });

  it("is not overdue on its due date itself, or after", () => {
    expect(isOverdue("RELEASED", day("2026-09-24"), AS_OF)).toBe(false);
    expect(isOverdue("RELEASED", day("2026-10-01"), AS_OF)).toBe(false);
  });

  it("never applies to a finished order, however late", () => {
    for (const s of ["COMPLETED", "CLOSED", "CANCELLED"] as const) {
      expect(isOverdue(s, day("2026-03-14"), AS_OF)).toBe(false);
    }
  });
});

describe("traceCompleteness", () => {
  const comps = (withLot: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ lotId: i < withLot ? `lot-${i}` : null }));

  it("is the share of components with a lot recorded", () => {
    expect(traceCompleteness("COMPLETED", comps(2, 6))).toBe(33);
    expect(traceCompleteness("IN_PROGRESS", comps(4, 4))).toBe(100);
    expect(traceCompleteness("CLOSED", comps(0, 3))).toBe(0);
  });

  it("is null before production starts, or with no components", () => {
    expect(traceCompleteness("RELEASED", comps(2, 6))).toBeNull();
    expect(traceCompleteness("FIRMED", comps(0, 6))).toBeNull();
    expect(traceCompleteness("COMPLETED", [])).toBeNull();
  });
});

describe("statusCounts", () => {
  it("counts every schema status, plus all and overdue", () => {
    const counts = statusCounts([
      { status: "COMPLETED", overdue: false },
      { status: "RELEASED", overdue: true },
      { status: "FIRMED", overdue: true },
    ]);
    expect(counts).toEqual({
      all: 3, overdue: 2,
      PLANNED: 0, FIRMED: 1, RELEASED: 1, IN_PROGRESS: 0, COMPLETED: 1, CLOSED: 0, CANCELLED: 0,
    });
  });

  it("is all zeros for no orders", () => {
    expect(Object.values(statusCounts([])).every((n) => n === 0)).toBe(true);
  });
});

describe("workCentreRoute", () => {
  it("lists work centres in operation order, once each", () => {
    expect(workCentreRoute([
      { sequence: 30, workCentre: "PACK-01" },
      { sequence: 10, workCentre: "BLEND-01" },
      { sequence: 20, workCentre: "FILL-02" },
      { sequence: 40, workCentre: "BLEND-01" },
      { sequence: 50, workCentre: null },
    ])).toEqual(["BLEND-01", "FILL-02", "PACK-01"]);
  });
});

describe("componentReadiness", () => {
  it("is available when stock covers what is still to issue", () => {
    expect(componentReadiness(1275, 0, 1275)).toEqual({ outstanding: 1275, onHand: 1275, shortfall: 0, status: "available" });
  });

  it("reports the shortfall when it does not", () => {
    expect(componentReadiness(1275, 0, 320)).toEqual({ outstanding: 1275, onHand: 320, shortfall: 955, status: "short" });
  });

  it("only counts what is still outstanding after issues", () => {
    expect(componentReadiness(505, 400, 120)).toMatchObject({ outstanding: 105, shortfall: 0, status: "available" });
  });

  it("is fully issued once nothing is outstanding, whatever the stock", () => {
    expect(componentReadiness(505, 505, 0)).toEqual({ outstanding: 0, onHand: 0, shortfall: 0, status: "issued" });
    expect(componentReadiness(505, 600, 0).status).toBe("issued");
  });

  it("keeps to the quantity column's six decimals, without float noise", () => {
    // 17.675 - 12 is 5.675000000000001 in floating point.
    expect(componentReadiness(17.675, 0, 12).shortfall).toBe(5.675);
    expect(componentReadiness(0.3, 0.1, 0).outstanding).toBe(0.2);
  });

  it("treats negative stock as none available", () => {
    expect(componentReadiness(10, 0, -5)).toMatchObject({ shortfall: 10, status: "short" });
  });
});
