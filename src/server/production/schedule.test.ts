import { describe, it, expect } from "vitest";
import {
  spanDays, addDaysIso, buildBars, workCentres, findOverlaps, unitOfConstraint, isPerDay, constraintFor,
  capacityLoads, buildConstraints, recordedSeverity, fitWindow, placeBar, assignLanes, buildSchedule,
  type ScheduleOrderInput, type StoredConstraint,
} from "./schedule";

const PUNE = { id: "pune", name: "Pune Plant" };
const AS_OF = new Date("2026-09-24T10:00:00Z");

const op = (sequence: number, workCentre: string | null, setupMinutes = 30, runMinutes = 120) => ({ sequence, workCentre, setupMinutes, runMinutes });

function order(over: Partial<ScheduleOrderInput> & { id: string }): ScheduleOrderInput {
  return {
    orderNumber: over.id.toUpperCase(), product: { id: "m-fg", code: "FG-001", name: "Cleaner" }, uom: "UNIT",
    location: PUNE, plannedQty: 350, plannedStartDate: "2026-03-28", plannedEndDate: "2026-03-31",
    status: "FIRMED", overdue: true, operations: [op(10, "BLEND-01"), op(20, "FILL-02")], shortages: [],
    ...over,
  };
}

const constraint = (over: Partial<StoredConstraint>): StoredConstraint => ({
  id: "c", name: "Blending line BLEND-01", type: "CAPACITY", location: PUNE, unit: "litres/day",
  capacity: 4000, utilised: 3100, effectiveFrom: "2026-01-01", effectiveTo: null, ...over,
});

describe("dates", () => {
  it("counts whole days inclusively", () => {
    expect(spanDays("2026-03-28", "2026-03-31")).toBe(4);
    expect(spanDays("2026-03-28", "2026-03-28")).toBe(1);
    expect(addDaysIso("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildBars", () => {
  it("places an order on each work centre of its route for its whole window", () => {
    const bars = buildBars([order({ id: "wo1" })]);
    expect(bars.map((b) => [b.workCentre, b.start, b.end, b.days])).toEqual([
      ["BLEND-01", "2026-03-28", "2026-03-31", 4],
      ["FILL-02", "2026-03-28", "2026-03-31", 4],
    ]);
  });

  it("sums minutes when a work centre repeats, and skips operations without one", () => {
    const bars = buildBars([order({ id: "wo1", operations: [op(10, "BLEND-01", 45, 200), op(20, null), op(30, "BLEND-01", 10, 60)] })]);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ workCentre: "BLEND-01", setupMinutes: 55, runMinutes: 260 });
  });

  it("gives cancelled orders no bars", () => {
    expect(buildBars([order({ id: "wo1", status: "CANCELLED" })])).toEqual([]);
  });

  it("lists work centres in first-appearance order", () => {
    const bars = buildBars([order({ id: "a", operations: [op(10, "BLEND-01"), op(20, "QC-LAB")] }), order({ id: "b" })]);
    expect(workCentres(bars)).toEqual(["BLEND-01", "QC-LAB", "FILL-02"]);
  });
});

describe("findOverlaps", () => {
  it("finds orders sharing a day on the same work centre", () => {
    const bars = buildBars([
      order({ id: "a", plannedStartDate: "2026-03-26", plannedEndDate: "2026-03-28" }),
      order({ id: "b", plannedStartDate: "2026-03-28", plannedEndDate: "2026-03-31" }),
    ]);
    expect(findOverlaps(bars)).toEqual([
      { workCentre: "BLEND-01", orders: ["A", "B"], from: "2026-03-28", to: "2026-03-28" },
      { workCentre: "FILL-02", orders: ["A", "B"], from: "2026-03-28", to: "2026-03-28" },
    ]);
  });

  it("does not count back-to-back days as an overlap", () => {
    const bars = buildBars([
      order({ id: "a", plannedStartDate: "2026-03-26", plannedEndDate: "2026-03-27" }),
      order({ id: "b", plannedStartDate: "2026-03-28", plannedEndDate: "2026-03-31" }),
    ]);
    expect(findOverlaps(bars)).toEqual([]);
  });
});

describe("unit matching", () => {
  it("recognises stocking units in a constraint's unit", () => {
    expect(unitOfConstraint("litres/day")).toBe("L");
    expect(unitOfConstraint("units/day")).toBe("UNIT");
    expect(unitOfConstraint("kg")).toBe("KG");
    expect(unitOfConstraint("hours/shift")).toBeNull();
    expect(unitOfConstraint(null)).toBeNull();
  });

  it("only compares per-day capacities", () => {
    expect(isPerDay("litres/day")).toBe(true);
    expect(isPerDay("hours/shift")).toBe(false);
    expect(isPerDay("kg")).toBe(false);
  });

  it("matches a capacity constraint to a work centre by its code, at the same location", () => {
    const cs = [constraint({ id: "blend" }), constraint({ id: "fill", name: "Filling line FILL-02" }), constraint({ id: "lab", name: "Shift labour — packing", type: "LABOUR" })];
    expect(constraintFor("BLEND-01", "pune", cs)?.id).toBe("blend");
    expect(constraintFor("FILL-02", "pune", cs)?.id).toBe("fill");
    expect(constraintFor("PACK-01", "pune", cs)).toBeNull();
    expect(constraintFor("BLEND-01", "mumbai", cs)).toBeNull();
    expect(constraintFor("BLEND-0", "pune", cs)).toBeNull(); // not a partial code
  });
});

describe("capacityLoads", () => {
  const cs = [constraint({ id: "blend" }), constraint({ id: "fill", name: "Filling line FILL-02", unit: "units/day", capacity: 2400 })];

  it("compares only orders in the constraint's unit, spread over their days", () => {
    const orders = [
      order({ id: "sa", orderNumber: "WO-SA", uom: "L", plannedQty: 600, plannedStartDate: "2026-03-26", plannedEndDate: "2026-03-27", operations: [op(10, "BLEND-01")] }),
      order({ id: "fg", orderNumber: "WO-FG" }),
    ];
    const loads = capacityLoads(orders, buildBars(orders), cs);
    const blend = loads.find((l) => l.workCentre === "BLEND-01")!;
    expect(blend.peak).toEqual({ date: "2026-03-26", load: 300, pct: 7.5 });
    expect(blend.notComparable).toEqual(["WO-FG"]);
    const fill = loads.find((l) => l.workCentre === "FILL-02")!;
    expect(fill.peak).toEqual({ date: "2026-03-28", load: 87.5, pct: 3.6 });
    expect(fill.overloaded).toBe(false);
  });

  it("adds overlapping orders on shared days and flags an overload", () => {
    const orders = [
      order({ id: "a", orderNumber: "A", plannedQty: 4000, plannedStartDate: "2026-03-28", plannedEndDate: "2026-03-29", operations: [op(10, "FILL-02")] }),
      order({ id: "b", orderNumber: "B", plannedQty: 1000, plannedStartDate: "2026-03-29", plannedEndDate: "2026-03-29", operations: [op(10, "FILL-02")] }),
    ];
    const [fill] = capacityLoads(orders, buildBars(orders), cs);
    expect(fill.peak).toEqual({ date: "2026-03-29", load: 3000, pct: 125 });
    expect(fill.overloaded).toBe(true);
  });

  it("has no comparison where there is no capacity record, or it is not per day", () => {
    const orders = [order({ id: "a", operations: [op(10, "PACK-01"), op(20, "BLEND-01")] })];
    const loads = capacityLoads(orders, buildBars(orders), [constraint({ unit: "litres" })]);
    expect(loads.find((l) => l.workCentre === "PACK-01")).toEqual({ workCentre: "PACK-01", constraint: null, peak: null, overloaded: false, notComparable: [] });
    expect(loads.find((l) => l.workCentre === "BLEND-01")).toMatchObject({ constraint: null, peak: null, notComparable: ["A"] });
  });
});

describe("buildConstraints", () => {
  const sa = order({
    id: "sa", orderNumber: "WO-0104", product: { id: "m-sa", code: "SA-101", name: "Concentrate" }, uom: "L", plannedQty: 600,
    plannedStartDate: "2026-03-26", plannedEndDate: "2026-03-27", shortages: [],
  });
  const fg = order({
    id: "fg", orderNumber: "WO-0108",
    shortages: [{ materialId: "m-sa", code: "SA-101", name: "Concentrate", uom: "L", shortfall: 572.5 }],
  });

  it("surfaces shortages with any earlier open order that makes the material — without netting it", () => {
    const [shortage] = buildConstraints([sa, fg], [], [], [], AS_OF);
    expect(shortage).toMatchObject({
      kind: "SHORTAGE", severity: "High", orderNumber: "WO-0108",
      shortages: [{ code: "SA-101", shortfall: 572.5 }],
      plannedSupply: [{ orderNumber: "WO-0104", materialCode: "SA-101", quantity: 600, uom: "L", plannedEnd: "2026-03-27" }],
    });
  });

  it("does not cite a finished order, one at another location, or one due after this starts", () => {
    const cases = [
      { ...sa, shortages: null },
      { ...sa, location: { id: "mum", name: "Mumbai" } },
      { ...sa, plannedEndDate: "2026-03-29" },
    ];
    for (const s of cases) {
      const [shortage] = buildConstraints([s, fg], [], [], [], AS_OF);
      expect(shortage.plannedSupply).toBeUndefined();
    }
  });

  it("lists overdue orders with days late, and stored constraints as recorded", () => {
    const out = buildConstraints([sa], [constraint({ utilised: 52, capacity: 64, name: "Shift labour — packing", type: "LABOUR", unit: "hours/shift" })], [], [], AS_OF);
    expect(out.find((c) => c.kind === "OVERDUE")).toMatchObject({ orderNumber: "WO-0104", overdueDays: 181 });
    expect(out.find((c) => c.kind === "STORED")).toMatchObject({ severity: "Medium", stored: { recordedPct: 81.3 } });
  });

  it("rates recorded utilisation", () => {
    expect(recordedSeverity(100)).toBe("High");
    expect(recordedSeverity(80)).toBe("Medium");
    expect(recordedSeverity(77.5)).toBe("Low");
    expect(recordedSeverity(null)).toBe("Low");
  });
});

describe("window", () => {
  it("fits every bar, at least a week wide", () => {
    expect(fitWindow([{ start: "2026-03-10", end: "2026-03-14" }, { start: "2026-03-28", end: "2026-03-31" }])).toEqual({ start: "2026-03-10", days: 22 });
    expect(fitWindow([{ start: "2026-03-26", end: "2026-03-27" }])).toEqual({ start: "2026-03-26", days: 7 });
    expect(fitWindow([])).toBeNull();
  });

  it("caps a very long span, leaving the rest to navigation", () => {
    expect(fitWindow([{ start: "2026-01-01", end: "2026-06-30" }])?.days).toBe(42);
  });

  it("places bars as percentages of the window, clipped at its edges", () => {
    const w = { start: "2026-03-10", days: 22 };
    expect(placeBar({ start: "2026-03-10", end: "2026-03-14" }, w)).toEqual({ left: 0, width: (5 / 22) * 100 });
    expect(placeBar({ start: "2026-03-28", end: "2026-04-05" }, w)).toEqual({ left: (18 / 22) * 100, width: (4 / 22) * 100 });
    expect(placeBar({ start: "2026-04-02", end: "2026-04-05" }, w)).toBeNull();
  });

  it("stacks bars that share a day into separate lanes", () => {
    const lanes = assignLanes([
      { id: "a", start: "2026-03-26", end: "2026-03-28" },
      { id: "b", start: "2026-03-28", end: "2026-03-31" },
      { id: "c", start: "2026-03-29", end: "2026-03-30" },
    ]);
    expect(lanes.map((b) => [b.id, b.lane])).toEqual([["a", 0], ["b", 1], ["c", 0]]);
  });
});

describe("buildSchedule", () => {
  it("adds route and total minutes to each order", () => {
    const v = buildSchedule([order({ id: "wo1", operations: [op(20, "FILL-02", 30, 140), op(10, "BLEND-01", 45, 200)] })], [], AS_OF);
    expect(v.orders[0]).toMatchObject({ workCentres: ["BLEND-01", "FILL-02"], setupMinutes: 75, runMinutes: 340 });
    expect("operations" in v.orders[0]).toBe(false);
    expect(v.workCentres).toEqual(["BLEND-01", "FILL-02"]);
  });
});
