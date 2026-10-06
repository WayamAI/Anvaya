import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { NAV_ACCESS, canSeeNavItem, visibleSections } from "./nav-access";
import { navPaths } from "./nav-items";

const holder = (...perms: string[]) => (p: string) => perms.includes(p);
const sections = [
  { label: "Inventory", items: [{ path: "/stock-overview" }, { path: "/batch-tracking" }] },
  { label: "Purchase", items: [{ path: "/purchase-orders" }] },
  { label: "Settings", items: [{ path: "/users-roles" }, { path: "" }] },
];

describe("permission-aware navigation", () => {
  it("decides every item in the sidebar explicitly", () => {
    for (const path of navPaths()) expect(NAV_ACCESS, `no access rule for ${path}`).toHaveProperty([path]);
  });

  it("shows an item only to someone holding the permission its screen reads with", () => {
    expect(canSeeNavItem("/purchase-orders", holder("purchase-order:read"))).toBe(true);
    expect(canSeeNavItem("/purchase-orders", holder("inventory:read"))).toBe(false);
    expect(canSeeNavItem("/mrp-run", holder("mrp:read"))).toBe(true);
  });

  it("accepts any of several permissions where the screen serves either", () => {
    expect(canSeeNavItem("/users-roles", holder("role:read"))).toBe(true);
    expect(canSeeNavItem("/users-roles", holder("user:read"))).toBe(true);
    expect(canSeeNavItem("/users-roles", holder("inventory:read"))).toBe(false);
  });

  it("keeps controls without a route, and drops sections left empty", () => {
    const viewer = visibleSections(sections, holder("inventory:read"));
    expect(viewer.map((s) => [s.label, s.items.map((i) => i.path)])).toEqual([
      ["Inventory", ["/stock-overview", "/batch-tracking"]],
      ["Settings", [""]], // theme and sign-out stay
    ]);
  });

  it("gates the planning and vendor screens by the permission their data needs", () => {
    expect(canSeeNavItem("/purchase-planning", holder("purchase-order:read"))).toBe(false);
    expect(canSeeNavItem("/purchase-planning", holder("mrp:read"))).toBe(true);
    expect(canSeeNavItem("/material-coverage", holder("mrp:read"))).toBe(true);
    expect(canSeeNavItem("/vendor-management", holder("mrp:read"))).toBe(false);
    expect(canSeeNavItem("/vendor-management", holder("vendor:read"))).toBe(true);
  });

  it("links only to screens that render, never to one parked behind notFound()", () => {
    for (const p of navPaths()) {
      const file = path.resolve(__dirname, "../../app/(app)", p === "/" ? "" : p.slice(1), "page.tsx");
      expect(readFileSync(file, "utf8"), `${p} is in the menu but answers 404`).not.toMatch(/notFound\(\)/);
    }
  });

  it("has no access rule left over for a screen no longer in the menu", () => {
    expect(Object.keys(NAV_ACCESS).sort()).toEqual([...new Set(navPaths())].sort());
  });
});
