import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { applyMovement, averageCost, bucketForQc, movingAverageCost, shiftBucket, unrestricted } from "./ledger";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const bal = (onHand: number, held: number, value: number) => ({ onHandQty: D(onHand), quarantineQty: D(held), valuation: D(value) });
const nums = (b: { onHandQty: Prisma.Decimal; quarantineQty: Prisma.Decimal; valuation: Prisma.Decimal }) =>
  [b.onHandQty.toNumber(), b.quarantineQty.toNumber(), b.valuation.toNumber()];

describe("applyMovement — inflows", () => {
  it("adds quantity and value at the receipt's own cost", () => {
    const r = applyMovement(bal(100, 0, 1000), { quantity: D(50), bucket: "UNRESTRICTED", unitCost: D(12) });
    expect(nums(r)).toEqual([150, 0, 1600]);
    expect(r.unitCost.toNumber()).toBe(12);
  });

  it("puts held receipts in quarantine as well as on hand", () => {
    const r = applyMovement(bal(100, 10, 1000), { quantity: D(40), bucket: "QUARANTINE", unitCost: D(10) });
    expect(nums(r)).toEqual([140, 50, 1400]);
  });

  it("refuses an inflow without a cost, or with a negative one", () => {
    expect(() => applyMovement(bal(0, 0, 0), { quantity: D(1), bucket: "UNRESTRICTED" })).toThrow(/unit cost/);
    expect(() => applyMovement(bal(0, 0, 0), { quantity: D(1), bucket: "UNRESTRICTED", unitCost: D(-1) })).toThrow(/unit cost/);
  });

  it("accepts a free (zero-cost) receipt", () => {
    expect(nums(applyMovement(bal(10, 0, 100), { quantity: D(10), bucket: "UNRESTRICTED", unitCost: D(0) }))).toEqual([20, 0, 100]);
  });

  it("refuses a zero movement", () => {
    expect(() => applyMovement(bal(1, 0, 1), { quantity: D(0), bucket: "UNRESTRICTED", unitCost: D(1) })).toThrow(/zero/);
  });
});

describe("applyMovement — outflows", () => {
  it("removes at the moving average, leaving the average unchanged", () => {
    const r = applyMovement(bal(150, 0, 1600), { quantity: D(-30), bucket: "UNRESTRICTED" });
    expect(r.unitCost.toFixed(4)).toBe("10.6667");
    expect(r.onHandQty.toNumber()).toBe(120);
    expect(r.valuation.toFixed(4)).toBe("1279.9990");
    expect(averageCost(r).toFixed(2)).toBe("10.67");
  });

  it("zeroes value when the balance empties, whatever rounding left", () => {
    const r = applyMovement(bal(3, 0, 10), { quantity: D(-3), bucket: "UNRESTRICTED" });
    expect(nums(r)).toEqual([0, 0, 0]);
  });

  it("cannot draw held stock as unrestricted", () => {
    // 100 on hand, 40 held → 60 usable.
    expect(unrestricted(bal(100, 40, 0)).toNumber()).toBe(60);
    expect(() => applyMovement(bal(100, 40, 1000), { quantity: D(-61), bucket: "UNRESTRICTED" })).toThrow(/60 available/);
    expect(applyMovement(bal(100, 40, 1000), { quantity: D(-60), bucket: "UNRESTRICTED" }).onHandQty.toNumber()).toBe(40);
  });

  it("draws held stock from the held bucket", () => {
    const r = applyMovement(bal(100, 40, 1000), { quantity: D(-40), bucket: "QUARANTINE" });
    expect(nums(r)).toEqual([60, 0, 600]);
    expect(() => applyMovement(bal(100, 40, 1000), { quantity: D(-41), bucket: "QUARANTINE" })).toThrow(/held/);
  });

  it("never lets stock go negative", () => {
    expect(() => applyMovement(bal(5, 0, 50), { quantity: D(-5.000001), bucket: "UNRESTRICTED" })).toThrow(/Not enough/);
  });
});

describe("shiftBucket", () => {
  it("releases held stock without touching on hand or value", () => {
    expect(nums(shiftBucket(bal(100, 40, 1000), D(40), "UNRESTRICTED"))).toEqual([100, 0, 1000]);
  });

  it("holds unrestricted stock", () => {
    expect(nums(shiftBucket(bal(100, 40, 1000), D(60), "QUARANTINE"))).toEqual([100, 100, 1000]);
  });

  it("refuses to release more than is held or hold more than is free", () => {
    expect(() => shiftBucket(bal(100, 40, 0), D(41), "UNRESTRICTED")).toThrow(/Only 40 is held/);
    expect(() => shiftBucket(bal(100, 40, 0), D(61), "QUARANTINE")).toThrow(/Only 60 is unrestricted/);
  });
});

describe("helpers", () => {
  it("maps quality status to bucket", () => {
    expect(bucketForQc("APPROVED")).toBe("UNRESTRICTED");
    for (const s of ["PENDING", "QUARANTINE", "REJECTED"]) expect(bucketForQc(s)).toBe("QUARANTINE");
  });

  it("averages cost across locations, or null with no stock", () => {
    expect(movingAverageCost([bal(100, 0, 1000), bal(50, 0, 800)])!.toFixed(4)).toBe("12.0000");
    expect(movingAverageCost([bal(0, 0, 0)])).toBeNull();
  });
});
