import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { toNumber, sumDecimals } from "./decimal";

describe("toNumber", () => {
  it("converts Prisma Decimals as stored — Decimal(18,6) comes back padded", () => {
    expect(toNumber(new Prisma.Decimal("4200.000000"))).toBe(4200);
    expect(toNumber(new Prisma.Decimal("3.5000"))).toBe(3.5);
  });

  it("accepts strings and numbers", () => {
    expect(toNumber("0.95")).toBe(0.95);
    expect(toNumber(12)).toBe(12);
  });

  it("keeps null and undefined as null, so 'no value' is never read as zero", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe("sumDecimals", () => {
  it("adds exactly", () => {
    expect(sumDecimals(["0.1", "0.2"]).toNumber()).toBe(0.3);
  });

  it("skips nulls and returns zero for nothing", () => {
    expect(sumDecimals([new Prisma.Decimal(5), null, undefined]).toNumber()).toBe(5);
    expect(sumDecimals([]).toNumber()).toBe(0);
  });
});
