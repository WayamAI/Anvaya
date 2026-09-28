import { describe, it, expect } from "vitest";
import { listLotsQuery, grnNumberParam } from "./lot";

describe("listLotsQuery", () => {
  it("defaults to 100 lots", () => {
    expect(listLotsQuery.parse({})).toEqual({ limit: 100 });
  });

  it("accepts known QC statuses and material kinds only", () => {
    expect(listLotsQuery.parse({ qcStatus: "QUARANTINE", kind: "RAW" })).toMatchObject({ qcStatus: "QUARANTINE", kind: "RAW" });
    expect(listLotsQuery.safeParse({ qcStatus: "FAILED" }).success).toBe(false);
    expect(listLotsQuery.safeParse({ kind: "GADGET" }).success).toBe(false);
  });

  it("caps the page size", () => {
    expect(listLotsQuery.safeParse({ limit: "501" }).success).toBe(false);
  });
});

describe("grnNumberParam", () => {
  it("normalises case and whitespace", () => {
    expect(grnNumberParam.parse(" grn-2026-0312 ")).toBe("GRN-2026-0312");
  });

  it("rejects anything that is not a GRN number", () => {
    for (const bad of ["", "2026-0312", "PO-2026-0198", "GRN 2026"]) {
      expect(grnNumberParam.safeParse(bad).success, bad).toBe(false);
    }
  });
});
