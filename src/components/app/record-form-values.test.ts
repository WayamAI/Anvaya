import { describe, it, expect } from "vitest";
import { nullNum, nullText, optNum, optText } from "./record-form-values";

describe("record form value conversion", () => {
  it("omits a blank optional field on create, and clears it to null on edit", () => {
    expect(optNum("")).toBeUndefined();
    expect(nullNum("")).toBeNull();
    expect(optText("   ")).toBeUndefined();
    expect(nullText("   ")).toBeNull();
  });

  it("keeps zero and trims text rather than treating them as blank", () => {
    expect(optNum("0")).toBe(0);
    expect(nullNum("12.5")).toBe(12.5);
    expect(optText("  Net 30 ")).toBe("Net 30");
  });

  it("passes a non-number through as NaN so validation rejects it rather than sending 0", () => {
    expect(Number.isNaN(optNum("abc"))).toBe(true);
  });
});
