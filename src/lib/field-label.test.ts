import { describe, it, expect } from "vitest";
import { describeProblem, fieldLabel } from "./field-label";

describe("field-level API problems", () => {
  it("names a field in words, positions counted from one", () => {
    expect(fieldLabel("requiredDate")).toBe("Required date");
    expect(fieldLabel("lines.4.quantity")).toBe("Line 5 quantity");
    expect(fieldLabel("lines.0.receivedQty")).toBe("Line 1 received quantity");
    expect(fieldLabel("coaReference")).toBe("Coa reference");
  });

  it("shows a self-contained sentence as it is, without the path", () => {
    expect(describeProblem({ path: "lines.4.quantity", message: "Not enough released, unexpired RM-8012 for 40.4: 32 available in lots" }))
      .toBe("Not enough released, unexpired RM-8012 for 40.4: 32 available in lots");
    expect(describeProblem({ path: "plannedOrderIds.0", message: "FG-002 has no active BOM to make it from" })).toBe("FG-002 has no active BOM to make it from");
  });

  it("puts the field name in front of a fragment", () => {
    expect(describeProblem({ path: "requiredDate", message: "cannot be before the order date" })).toBe("Required date: cannot be before the order date");
    expect(describeProblem({ path: "lines.1.quantity", message: "must be greater than 0" })).toBe("Line 2 quantity: must be greater than 0");
  });
});
