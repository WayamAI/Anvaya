import { describe, it, expect } from "vitest";
import { z } from "zod";
import { cursorArgs, cursorPage, pageOf } from "./pagination";

describe("cursor pagination", () => {
  const schema = z.object(cursorPage(50, 200));

  it("defaults the page size and caps it", () => {
    expect(schema.parse({})).toEqual({ limit: 50 });
    expect(schema.parse({ limit: "10", cursor: "abc" })).toEqual({ limit: 10, cursor: "abc" });
    expect(schema.safeParse({ limit: "201" }).success).toBe(false);
    expect(schema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("asks for one row more than the page, to know whether another follows", () => {
    expect(cursorArgs({ limit: 10 })).toEqual({ take: 11 });
    expect(cursorArgs({ limit: 10, cursor: "x" })).toEqual({ take: 11, cursor: { id: "x" }, skip: 1 });
  });

  it("returns the page and the cursor of its last row only when more follow", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pageOf(rows, 2)).toEqual({ items: [{ id: "a" }, { id: "b" }], nextCursor: "b" });
    expect(pageOf(rows, 3)).toEqual({ items: rows, nextCursor: null });
  });
});
