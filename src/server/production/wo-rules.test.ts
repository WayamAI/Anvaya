import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "@/server/errors/app-error";
import {
  assertOutputWithinPlan, assertWoTransition, outputUnitCost, planIssue, snapshotComponents, type BomLine,
} from "./wo-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const details = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (AppError.is(e)) return e.details?.map((d) => `${d.path}: ${d.message}`) ?? [e.message];
    throw e;
  }
  throw new Error("expected a failure");
};

describe("assertWoTransition", () => {
  it("follows the documented lifecycle", () => {
    expect(() => assertWoTransition("PLANNED", "firm", "WO-1")).not.toThrow();
    expect(() => assertWoTransition("FIRMED", "release", "WO-1")).not.toThrow();
    expect(() => assertWoTransition("RELEASED", "issue", "WO-1")).not.toThrow();
    expect(() => assertWoTransition("IN_PROGRESS", "output", "WO-1")).not.toThrow();
    expect(() => assertWoTransition("COMPLETED", "close", "WO-1")).not.toThrow();
    expect(() => assertWoTransition("PLANNED", "issue", "WO-1")).toThrow(/is PLANNED and cannot be issued to; it must be RELEASED or IN_PROGRESS/);
    expect(() => assertWoTransition("RELEASED", "edit", "WO-1")).toThrow(/cannot be edited/);
    expect(() => assertWoTransition("IN_PROGRESS", "cancel", "WO-1")).toThrow(/cannot be cancelled/);
  });
});

describe("snapshotComponents", () => {
  const line = (over: Partial<BomLine> = {}): BomLine => ({
    materialId: "rm", materialCode: "RM-1", unitOfMeasureId: "kg", stockUnitOfMeasureId: "kg",
    quantity: D(32), scrapFactor: D(0.02), leadTimeOffsetDays: 0, isOptional: false, ...over,
  });

  it("computes qty ÷ base × order × (1 + scrap), rounding up at 6 places", () => {
    // 32 kg per 100 L, 2% scrap, for 250 L → 81.6 kg.
    expect(snapshotComponents([line()], D(100), D(250))[0].requiredQty.toString()).toBe("81.6");
    // 1 per 3 for 1 unit → 0.333333… rounds up so the floor never under-issues.
    expect(snapshotComponents([line({ quantity: D(1), scrapFactor: D(0) })], D(3), D(1))[0].requiredQty.toString()).toBe("0.333334");
  });

  it("skips optional lines and sums a material listed twice", () => {
    const r = snapshotComponents([
      line({ quantity: D(10), scrapFactor: D(0) }),
      line({ quantity: D(5), scrapFactor: D(0) }),
      line({ materialId: "alt", materialCode: "RM-ALT", isOptional: true }),
    ], D(1), D(2));
    expect(r.map((c) => [c.materialId, c.requiredQty.toNumber()])).toEqual([["rm", 30]]);
  });

  it("refuses a line quoted in a unit the material is not stocked in", () => {
    expect(details(() => snapshotComponents([line({ unitOfMeasureId: "g" })], D(1), D(1))))
      .toEqual(["bom: RM-1 is quoted in a different unit from the one it is stocked in; no conversion is defined"]);
  });
});

describe("planIssue", () => {
  const comp = { id: "c1", materialId: "rm", materialCode: "RM-1", requiredQty: D(100), issuedQty: D(60) };

  it("allows up to the requirement plus tolerance", () => {
    expect(planIssue([comp], [{ materialId: "rm", quantity: 40 }], 0)[0].issuedAfter.toNumber()).toBe(100);
    expect(planIssue([comp], [{ materialId: "rm", quantity: 50 }], 10)[0].issuedAfter.toNumber()).toBe(110);
    expect(details(() => planIssue([comp], [{ materialId: "rm", quantity: 51 }], 10)))
      .toEqual(["lines.0.quantity: RM-1: issuing 51 would exceed the requirement of 100 plus 10%; at most 50 more"]);
  });

  it("rejects non-components, repeats and lot totals that do not add up", () => {
    expect(details(() => planIssue([comp], [
      { materialId: "x", quantity: 1 },
      { materialId: "rm", quantity: 2, lots: [{ lotId: "a", quantity: 1 }] },
    ], 0))).toEqual([
      "lines.0.materialId: is not a component of this work order",
      "lines.1.lots: lot quantities add up to 1, not 2",
    ]);
  });
});

describe("output", () => {
  it("caps total output at plan plus tolerance", () => {
    expect(() => assertOutputWithinPlan(D(100), D(110), 10, "WO-1")).not.toThrow();
    expect(() => assertOutputWithinPlan(D(100), D(110.1), 10, "WO-1")).toThrow(/more than the planned 100 plus 10%/);
  });

  it("values partial output at its share of what is not yet capitalised", () => {
    // 1000 issued for 100 to make; 40 now → 400 → 10 each.
    expect(outputUnitCost({ issuedValue: D(1000), capitalisedValue: D(0), quantity: D(40), remainingToMake: D(100), completing: false, standardCost: D(7) }).toNumber()).toBe(10);
    // The completing output takes the whole remainder: 600 over 50 → 12.
    expect(outputUnitCost({ issuedValue: D(1000), capitalisedValue: D(400), quantity: D(50), remainingToMake: D(60), completing: true, standardCost: D(7) }).toNumber()).toBe(12);
  });

  it("falls back to standard cost with nothing issued", () => {
    expect(outputUnitCost({ issuedValue: D(0), capitalisedValue: D(0), quantity: D(5), remainingToMake: D(5), completing: false, standardCost: D(7) }).toNumber()).toBe(7);
  });
});
