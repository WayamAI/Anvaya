import { describe, it, expect } from "vitest";
import { policyBody, updateSettingsBody } from "./masterdata";

describe("policyBody", () => {
  const base = { procurementType: "BUY" };

  it("refuses a maximum order quantity below the order multiple", () => {
    // No order could be both at most 10 and a whole multiple of 100.
    const r = policyBody.safeParse({ ...base, orderMultiple: 100, maxOrderQty: 10 });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("maxOrderQty");
  });

  it("accepts a maximum at or above the multiple, or either one unset", () => {
    expect(policyBody.safeParse({ ...base, orderMultiple: 100, maxOrderQty: 100 }).success).toBe(true);
    expect(policyBody.safeParse({ ...base, orderMultiple: 100, maxOrderQty: 250 }).success).toBe(true);
    expect(policyBody.safeParse({ ...base, orderMultiple: 0, maxOrderQty: 10 }).success).toBe(true);
    expect(policyBody.safeParse({ ...base, orderMultiple: 100, maxOrderQty: null }).success).toBe(true);
  });
});

describe("updateSettingsBody", () => {
  it("takes the reschedule-in tolerance as whole days from 0 to 90", () => {
    expect(updateSettingsBody.safeParse({ "mrp.rescheduleInToleranceDays": 5 }).success).toBe(true);
    expect(updateSettingsBody.safeParse({ "mrp.rescheduleInToleranceDays": 0 }).success).toBe(true);
    for (const bad of [-1, 2.5, 91]) expect(updateSettingsBody.safeParse({ "mrp.rescheduleInToleranceDays": bad }).success).toBe(false);
  });
});
