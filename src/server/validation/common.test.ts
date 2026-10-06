import { describe, it, expect } from "vitest";
import { nonNegativeQty, price, qty } from "./common";

/*
 * Bounds that fit the columns: quantities are Decimal(18,6), money
 * Decimal(18,4). A value past them used to reach Postgres and come back as a
 * 500; it must be a 422 at the door instead.
 */
describe("quantity and price bounds", () => {
  it("accepts quantities below a billion, to six places", () => {
    expect(qty.safeParse(999_999_999.999999).success).toBe(true);
    expect(nonNegativeQty.safeParse(0).success).toBe(true);
  });

  it("refuses quantities of a billion or more", () => {
    for (const s of [qty, nonNegativeQty]) {
      expect(s.safeParse(1e9).success).toBe(false);
      expect(s.safeParse(1e12).success).toBe(false);
    }
  });

  it("accepts prices below a billion, to four places, and refuses more", () => {
    expect(price.safeParse(12.3456).success).toBe(true);
    expect(price.safeParse(12.34567).success).toBe(false);
    expect(price.safeParse(1e9).success).toBe(false);
    expect(price.safeParse(-1).success).toBe(false);
  });
});
