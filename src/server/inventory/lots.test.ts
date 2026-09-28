import { describe, it, expect } from "vitest";
import {
  daysBetween, daysToExpiry, isExpiringSoon, lotValue, needsContainment,
  isBackwardComplete, isForwardComplete, traceCompleteness, EXPIRY_WINDOW_DAYS,
  type TraceFacts,
} from "./lots";

const AS_OF = new Date("2026-09-24T15:30:00Z");
const on = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("daysBetween", () => {
  it("counts calendar days, ignoring time of day", () => {
    expect(daysBetween(AS_OF, on("2026-09-24"))).toBe(0);
    expect(daysBetween(AS_OF, on("2026-09-25"))).toBe(1);
    expect(daysBetween(on("2026-03-14"), AS_OF)).toBe(194);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysBetween(AS_OF, on("2026-09-20"))).toBe(-4);
  });
});

describe("expiry", () => {
  const lot = (expiry: string | null, remaining = 10) => ({ remainingQty: remaining, expiryDate: expiry ? on(expiry) : null });

  it("reports days to expiry, or null when there is no expiry date", () => {
    expect(daysToExpiry(lot("2026-10-04"), AS_OF)).toBe(10);
    expect(daysToExpiry(lot(null), AS_OF)).toBeNull();
  });

  it(`flags lots expiring today through ${EXPIRY_WINDOW_DAYS} days out`, () => {
    expect(isExpiringSoon(lot("2026-09-24"), AS_OF)).toBe(true);
    expect(isExpiringSoon(lot("2026-10-24"), AS_OF)).toBe(true);
    expect(isExpiringSoon(lot("2026-10-25"), AS_OF)).toBe(false);
  });

  it("does not flag lots that have already expired", () => {
    expect(isExpiringSoon(lot("2026-09-23"), AS_OF)).toBe(false);
  });

  it("does not flag a lot with nothing left, or one with no expiry date", () => {
    expect(isExpiringSoon(lot("2026-09-30", 0), AS_OF)).toBe(false);
    expect(isExpiringSoon(lot(null), AS_OF)).toBe(false);
  });
});

describe("lotValue", () => {
  it("is remaining quantity at standard cost", () => {
    expect(lotValue(850, 185)).toBe(157250);
  });

  it("is null without a cost — never a guessed rate", () => {
    expect(lotValue(850, null)).toBeNull();
  });

  it("never goes negative", () => {
    expect(lotValue(-5, 10)).toBe(0);
  });
});

describe("needsContainment", () => {
  it("covers quarantined and rejected lots only", () => {
    expect(needsContainment("QUARANTINE")).toBe(true);
    expect(needsContainment("REJECTED")).toBe(true);
    expect(needsContainment("APPROVED")).toBe(false);
    expect(needsContainment("PENDING")).toBe(false);
  });
});

describe("trace completeness", () => {
  const withCoa = { receipt: { coaReference: "COA-1" } };
  const noCoa = { receipt: { coaReference: null } };
  const facts = (over: Partial<TraceFacts>): TraceFacts => ({
    receipt: null, production: null, consumedQty: 0, accountedOutQty: 0, ...over,
  });

  describe("backward", () => {
    it("is complete for a purchased lot with a receipt carrying a CoA", () => {
      expect(isBackwardComplete(facts({ receipt: { coaReference: "COA-1" } }))).toBe(true);
    });

    it("is incomplete for a receipt without a CoA, or no receipt at all", () => {
      expect(isBackwardComplete(facts({ receipt: { coaReference: null } }))).toBe(false);
      expect(isBackwardComplete(facts({}))).toBe(false);
    });

    it("is complete for a produced lot when every component traces to a CoA", () => {
      expect(isBackwardComplete(facts({ production: { components: [{ lot: withCoa }, { lot: withCoa }] } }))).toBe(true);
    });

    it("breaks on any component with no lot, or a lot without a CoA", () => {
      expect(isBackwardComplete(facts({ production: { components: [{ lot: withCoa }, { lot: null }] } }))).toBe(false);
      expect(isBackwardComplete(facts({ production: { components: [{ lot: withCoa }, { lot: noCoa }] } }))).toBe(false);
    });

    it("is incomplete for a produced lot whose order lists no components", () => {
      expect(isBackwardComplete(facts({ production: { components: [] } }))).toBe(false);
    });
  });

  describe("forward", () => {
    it("is not applicable when nothing has left the lot", () => {
      expect(isForwardComplete(facts({ consumedQty: 0 }))).toBeNull();
    });

    it("is complete when recorded outflows cover what was consumed", () => {
      expect(isForwardComplete(facts({ consumedQty: 240, accountedOutQty: 240 }))).toBe(true);
    });

    it("is incomplete when consumption is not explained by a record", () => {
      expect(isForwardComplete(facts({ consumedQty: 350, accountedOutQty: 0 }))).toBe(false);
      expect(isForwardComplete(facts({ consumedQty: 350, accountedOutQty: 349 }))).toBe(false);
    });
  });

  it("summarises as percentages over the applicable lots", () => {
    const summary = traceCompleteness([
      facts({ receipt: { coaReference: "COA-1" }, consumedQty: 100, accountedOutQty: 100 }),
      facts({ receipt: { coaReference: null }, consumedQty: 50 }),
      facts({ receipt: { coaReference: "COA-2" } }),
    ]);
    expect(summary).toEqual({ backwardPct: 67, forwardPct: 50, lotCount: 3, forwardEligible: 2 });
  });

  it("reports null rather than 0% or 100% when there is nothing to measure", () => {
    expect(traceCompleteness([])).toMatchObject({ backwardPct: null, forwardPct: null });
    expect(traceCompleteness([facts({ receipt: { coaReference: "C" } })]).forwardPct).toBeNull();
  });
});
