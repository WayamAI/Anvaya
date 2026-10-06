import { describe, it, expect } from "vitest";
import { usableStock } from "./supply";

const bal = (materialId: string, onHandQty: number, quarantineQty = 0) => ({ materialId, locationId: "PLANT", onHandQty, quarantineQty });

describe("usableStock", () => {
  it("is on hand less held stock and released lots already expired", () => {
    // 500 on hand: 100 held by quality, 150 in a released lot that expired.
    expect(usableStock([bal("RM", 500, 100)], [{ materialId: "RM", locationId: "PLANT", remainingQty: 150 }]))
      .toEqual([{ materialId: "RM", locationId: "PLANT", qty: 250 }]);
  });

  it("sums several expired lots per material and location, and leaves others alone", () => {
    const out = usableStock(
      [bal("RM", 300), bal("PM", 40), { materialId: "RM", locationId: "DEPOT", onHandQty: 70, quarantineQty: 0 }],
      [
        { materialId: "RM", locationId: "PLANT", remainingQty: 100 },
        { materialId: "RM", locationId: "PLANT", remainingQty: 50 },
      ],
    );
    expect(out).toEqual([
      { materialId: "RM", locationId: "PLANT", qty: 150 },
      { materialId: "PM", locationId: "PLANT", qty: 40 },
      { materialId: "RM", locationId: "DEPOT", qty: 70 },
    ]);
  });

  it("never goes below zero and drops balances with nothing usable", () => {
    expect(usableStock([bal("RM", 100, 60), bal("PM", 0)], [{ materialId: "RM", locationId: "PLANT", remainingQty: 80 }])).toEqual([]);
  });
});
