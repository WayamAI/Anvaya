import { describe, it, expect } from "vitest";
import { listMaterialsQuery, listLocationsQuery, activeWhere } from "./material";

describe("listMaterialsQuery", () => {
  it("defaults to active materials, 50 per page", () => {
    expect(listMaterialsQuery.parse({})).toEqual({ active: "true", limit: 50 });
  });

  it("coerces the limit from the query string", () => {
    expect(listMaterialsQuery.parse({ limit: "10" }).limit).toBe(10);
  });

  it("rejects an out-of-range limit", () => {
    expect(listMaterialsQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(listMaterialsQuery.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("accepts known material kinds only", () => {
    expect(listMaterialsQuery.parse({ kind: "PACKAGING" }).kind).toBe("PACKAGING");
    expect(listMaterialsQuery.safeParse({ kind: "GADGET" }).success).toBe(false);
  });

  it("narrows to several kinds at once, for pickers", () => {
    expect(listMaterialsQuery.parse({ kinds: "RAW,PACKAGING" }).kinds).toEqual(["RAW", "PACKAGING"]);
    expect(listMaterialsQuery.parse({ kinds: " finished , semi_finished " }).kinds).toEqual(["FINISHED", "SEMI_FINISHED"]);
    expect(listMaterialsQuery.safeParse({ kinds: "RAW,GADGET" }).success).toBe(false);
    expect(listMaterialsQuery.parse({}).kinds).toBeUndefined();
  });

  it("trims the search term", () => {
    expect(listMaterialsQuery.parse({ q: "  resin " }).q).toBe("resin");
  });
});

describe("active filter", () => {
  it("accepts true, false and all", () => {
    for (const active of ["true", "false", "all"]) {
      expect(listLocationsQuery.safeParse({ active }).success).toBe(true);
    }
    expect(listLocationsQuery.safeParse({ active: "yes" }).success).toBe(false);
  });

  it("maps onto isActive", () => {
    expect(activeWhere("true")).toEqual({ isActive: true });
    expect(activeWhere("false")).toEqual({ isActive: false });
    expect(activeWhere("all")).toEqual({});
  });
});
