import { describe, it, expect } from "vitest";
import { createPurchaseOrderBody } from "./purchasing";

const body = (lines: object[]) => ({ vendorId: "v", locationId: "l", expectedDeliveryDate: "2026-04-10", lines });

describe("createPurchaseOrderBody", () => {
  it("accepts one material on several lines — whether their dates clash is the service's call", () => {
    // The body cannot know a line's effective date (it may default to the
    // header, or to the stored header on edit), so it does not judge it.
    const r = createPurchaseOrderBody.safeParse(body([
      { materialId: "m", orderedQty: 100, expectedDeliveryDate: "2026-04-05" },
      { materialId: "m", orderedQty: 100, expectedDeliveryDate: "2026-04-15" },
    ]));
    expect(r.success).toBe(true);
  });

  it("still needs at least one line", () => {
    expect(createPurchaseOrderBody.safeParse(body([])).success).toBe(false);
  });
});
