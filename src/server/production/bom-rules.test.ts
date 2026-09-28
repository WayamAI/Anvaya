import { describe, it, expect } from "vitest";
import { findCycle } from "./bom-rules";

describe("findCycle", () => {
  // FG ← SA ← RM; FG ← PM
  const graph = new Map([["FG", ["SA", "PM"]], ["SA", ["RM"]]]);

  it("accepts a new version that keeps the structure acyclic", () => {
    expect(findCycle("SA", ["RM", "RM2"], graph)).toBeNull();
    expect(findCycle("NEW", ["FG"], graph)).toBeNull();
  });

  it("finds a direct and an indirect loop, naming the path", () => {
    expect(findCycle("SA", ["FG"], graph)).toEqual(["SA", "FG", "SA"]);
    // RM made from FG: FG → SA → RM → FG.
    expect(findCycle("RM", ["FG"], graph)).toEqual(["RM", "FG", "SA", "RM"]);
  });

  it("replaces the parent's current recipe rather than adding to it", () => {
    const g = new Map([["A", ["B"]], ["B", ["C"]]]);
    // A's old recipe (B) is irrelevant once replaced.
    expect(findCycle("C", ["A"], g)).toEqual(["C", "A", "B", "C"]);
    expect(findCycle("A", ["D"], new Map([["A", ["B"]], ["B", ["A"]]]))).toBeNull();
  });

  it("walks shared sub-assemblies once", () => {
    const g = new Map([["X", ["S", "S2"]], ["S", ["R"]], ["S2", ["S"]]]);
    expect(findCycle("X", ["S", "S2"], g)).toBeNull();
  });
});
