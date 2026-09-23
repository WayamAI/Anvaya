import { describe, it, expect } from "vitest";
import {
  MATERIALS, BOM_FG001, BOM_SA101, POLICIES_PUNE, VENDORS,
  PERMISSIONS, ROLES, USERS, CATEGORIES, CATEGORY_PARENTS, UNITS, LOCATIONS,
} from "./master-data";
import { BALANCES, LOTS, PURCHASE_ORDERS, GOODS_RECEIPTS, SALES_ORDERS, FORECASTS, WORK_ORDERS } from "./operational-data";

/**
 * These guard the seed definition itself, before it ever reaches the
 * database. A dangling material code in a BOM would otherwise surface as an
 * opaque foreign-key error halfway through seeding.
 */

const materialCodes = new Set(MATERIALS.map((m) => m.code));
const unitCodes = new Set(UNITS.map((u) => u.code));
const locationCodes = new Set(LOCATIONS.map((l) => l.code));
const categoryCodes = new Set(CATEGORIES.map((c) => c.code));

describe("seed master data", () => {
  it("has unique material codes", () => {
    expect(materialCodes.size).toBe(MATERIALS.length);
  });

  it("gives every material a known unit and category", () => {
    for (const m of MATERIALS) {
      expect(unitCodes, `${m.code} unit`).toContain(m.uom);
      expect(categoryCodes, `${m.code} category`).toContain(m.category);
    }
  });

  it("points every category at a real parent", () => {
    const parents = new Set(CATEGORY_PARENTS.map((p) => p.code));
    for (const c of CATEGORIES) expect(parents).toContain(c.parent);
  });

  it("gives every material a positive standard cost", () => {
    for (const m of MATERIALS) expect(m.standardCost, m.code).toBeGreaterThan(0);
  });
});

describe("seed bills of material", () => {
  it("references only known materials and units", () => {
    for (const bom of [BOM_FG001, BOM_SA101]) {
      expect(materialCodes, bom.code).toContain(bom.material);
      for (const c of bom.components) {
        expect(materialCodes, `${bom.code} -> ${c.material}`).toContain(c.material);
        expect(unitCodes, `${bom.code} -> ${c.material} unit`).toContain(c.uom);
      }
    }
  });

  it("never lists a BOM's own output as one of its components", () => {
    for (const bom of [BOM_FG001, BOM_SA101]) {
      expect(bom.components.map((c) => c.material)).not.toContain(bom.material);
    }
  });

  it("is genuinely multi-level: FG-001 consumes SA-101, which has its own BOM", () => {
    expect(BOM_FG001.components.map((c) => c.material)).toContain("SA-101");
    expect(BOM_SA101.material).toBe("SA-101");
    expect(BOM_SA101.components.length).toBeGreaterThan(0);
  });

  it("uses positive quantities and sane scrap factors", () => {
    for (const bom of [BOM_FG001, BOM_SA101]) {
      expect(bom.baseQuantity).toBeGreaterThan(0);
      for (const c of bom.components) {
        expect(c.quantity, `${bom.code}/${c.material}`).toBeGreaterThan(0);
        expect(c.scrapFactor).toBeGreaterThanOrEqual(0);
        expect(c.scrapFactor).toBeLessThan(1);
      }
    }
  });

  it("has no duplicate component lines within a version", () => {
    for (const bom of [BOM_FG001, BOM_SA101]) {
      const codes = bom.components.map((c) => c.material);
      expect(new Set(codes).size, bom.code).toBe(codes.length);
    }
  });
});

describe("seed planning policy", () => {
  it("covers known materials at known locations", () => {
    for (const p of POLICIES_PUNE) {
      expect(materialCodes, p.material).toContain(p.material);
      expect(locationCodes, p.location).toContain(p.location);
    }
  });

  it("has one policy per material/location pair", () => {
    const keys = POLICIES_PUNE.map((p) => `${p.material}@${p.location}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives manufactured materials a production lead time", () => {
    for (const p of POLICIES_PUNE.filter((x) => x.procurementType === "MAKE")) {
      expect(p.productionLeadTimeDays, p.material).toBeGreaterThan(0);
    }
  });

  it("keeps reorder point at or above safety stock", () => {
    for (const p of POLICIES_PUNE) {
      expect(p.reorderPoint, p.material).toBeGreaterThanOrEqual(p.safetyStock);
    }
  });

  it("uses service levels that are probabilities", () => {
    for (const p of POLICIES_PUNE) {
      if (p.serviceLevel === undefined) continue;
      expect(p.serviceLevel).toBeGreaterThan(0.5);
      expect(p.serviceLevel).toBeLessThan(1);
    }
  });
});

describe("seed vendors", () => {
  it("supplies only known materials, with a positive lead time and price", () => {
    for (const v of VENDORS) {
      for (const m of v.materials) {
        expect(materialCodes, `${v.code} -> ${m.material}`).toContain(m.material);
        expect(m.leadTimeDays, `${v.code}/${m.material}`).toBeGreaterThan(0);
        expect(m.unitPrice).toBeGreaterThan(0);
      }
    }
  });

  it("has unique vendor codes", () => {
    const codes = VENDORS.map((v) => v.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every purchased material in a BOM at least one preferred vendor", () => {
    const supplied = new Map<string, number>();
    for (const v of VENDORS) {
      for (const m of v.materials) {
        if (m.isPreferred) supplied.set(m.material, (supplied.get(m.material) ?? 0) + 1);
      }
    }

    // Everything a BOM consumes that is not itself manufactured must be buyable,
    // or MRP cannot plan it and will raise MISSING_VENDOR.
    const made = new Set(POLICIES_PUNE.filter((p) => p.procurementType === "MAKE").map((p) => p.material));
    const consumed = [...BOM_FG001.components, ...BOM_SA101.components].map((c) => c.material);

    for (const code of consumed) {
      if (made.has(code)) continue;
      expect(supplied.get(code), `${code} has no preferred vendor`).toBe(1);
    }
  });
});

describe("seed roles and permissions", () => {
  it("has unique permission codes in resource:action form", () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z-]+:[a-z-]+$/);
  });

  it("grants every role only permissions that exist", () => {
    const codes = new Set(PERMISSIONS.map((p) => p.code));
    for (const r of ROLES) {
      if (r.permissions === "*") continue;
      for (const p of r.permissions) expect(codes, `${r.code} -> ${p}`).toContain(p);
    }
  });

  it("gives only the planner the right to run MRP, alongside admin", () => {
    const canRun = ROLES.filter((r) => r.permissions === "*" || r.permissions.includes("mrp:run")).map((r) => r.code);
    expect(canRun).toEqual(["ADMIN", "PLANNER"]);
  });

  it("keeps the viewer read-only", () => {
    const viewer = ROLES.find((r) => r.code === "VIEWER")!;
    for (const p of viewer.permissions as string[]) expect(p.endsWith(":read")).toBe(true);
  });

  it("assigns every demo user a role that exists", () => {
    const roleCodes = new Set(ROLES.map((r) => r.code));
    for (const u of USERS) expect(roleCodes, u.email).toContain(u.role);
  });
});

describe("seed operational data", () => {
  it("references known materials and locations everywhere", () => {
    for (const b of BALANCES) {
      expect(materialCodes, b.material).toContain(b.material);
      expect(locationCodes, b.location).toContain(b.location);
    }
    for (const l of LOTS) expect(materialCodes, l.lotNumber).toContain(l.material);
    for (const po of PURCHASE_ORDERS) for (const l of po.lines) expect(materialCodes, po.orderNumber).toContain(l.material);
    for (const so of SALES_ORDERS) for (const l of so.lines) expect(materialCodes, so.orderNumber).toContain(l.material);
    for (const f of FORECASTS) expect(materialCodes, f.material).toContain(f.material);
    for (const w of WORK_ORDERS) expect(materialCodes, w.orderNumber).toContain(w.material);
  });

  it("never reserves more stock than is on hand", () => {
    for (const b of BALANCES) {
      expect(b.reservedQty ?? 0, `${b.material}@${b.location}`).toBeLessThanOrEqual(b.onHandQty);
    }
  });

  it("keeps lot arithmetic consistent", () => {
    for (const l of LOTS) expect(l.consumedQty, l.lotNumber).toBeLessThanOrEqual(l.receivedQty);
  });

  it("never receives more than was ordered on a purchase order", () => {
    for (const po of PURCHASE_ORDERS) {
      for (const l of po.lines) {
        expect(l.receivedQty, `${po.orderNumber}/${l.material}`).toBeLessThanOrEqual(l.orderedQty);
      }
    }
  });

  it("matches purchase order status to its receipt position", () => {
    for (const po of PURCHASE_ORDERS) {
      const full = po.lines.every((l) => l.receivedQty === l.orderedQty);
      const none = po.lines.every((l) => l.receivedQty === 0);
      if (po.status === "FULLY_RECEIVED") expect(full, po.orderNumber).toBe(true);
      if (po.status === "ORDERED" || po.status === "APPROVED") expect(none, po.orderNumber).toBe(true);
      if (po.status === "PARTIALLY_RECEIVED") expect(full || none, po.orderNumber).toBe(false);
    }
  });

  it("ties every goods receipt to a purchase order that ordered that material", () => {
    const byNumber = new Map(PURCHASE_ORDERS.map((p) => [p.orderNumber, p]));
    for (const grn of GOODS_RECEIPTS) {
      const po = byNumber.get(grn.purchaseOrder);
      expect(po, grn.grnNumber).toBeDefined();
      for (const l of grn.lines) {
        expect(po!.lines.map((x) => x.material), grn.grnNumber).toContain(l.material);
      }
      expect(po!.vendor, grn.grnNumber).toBe(grn.vendor);
    }
  });

  it("never ships more than was ordered on a sales order", () => {
    for (const so of SALES_ORDERS) {
      for (const l of so.lines) expect(l.shippedQty, so.orderNumber).toBeLessThanOrEqual(l.quantity);
    }
  });

  /*
    Consumption is deliberately NOT capped at the forecast. Real demand
    overshoots a forecast routinely — FG-002 forecast 600 for March and sold
    640 — and that over-consumption is exactly what the Forecast vs Actuals
    screen exists to show. The rule MRP applies is
    `remaining forecast = max(0, forecast - consumed)`, which handles the
    overshoot by flooring at zero rather than by forbidding it.
  */
  it("records forecast consumption as a non-negative quantity", () => {
    for (const f of FORECASTS) {
      for (const p of f.periods) {
        expect(p.consumedQty ?? 0, `${f.material} ${p.periodStart}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("treats a closed period's consumption as its actual demand", () => {
    for (const f of FORECASTS) {
      for (const p of f.periods) {
        if (p.actualQty === undefined) continue;
        expect(p.consumedQty, `${f.material} ${p.periodStart}`).toBe(p.actualQty);
      }
    }
  });

  it("leaves remaining forecast at zero when demand overshot it", () => {
    const remaining = (forecast: number, consumed: number) => Math.max(0, forecast - consumed);
    expect(remaining(600, 640)).toBe(0);
    expect(remaining(1400, 1220)).toBe(180);
  });

  it("gives the MRP engine open demand after the as-of date", () => {
    const open = SALES_ORDERS.filter((s) => s.status === "CONFIRMED" && s.requiredDate > "2026-03-25");
    expect(open.length).toBeGreaterThan(0);
  });

  it("gives the MRP engine open supply to net against", () => {
    const openPo = PURCHASE_ORDERS.filter((p) => p.status === "ORDERED" || p.status === "APPROVED");
    const openWo = WORK_ORDERS.filter((w) => w.status === "RELEASED" || w.status === "FIRMED");
    expect(openPo.length).toBeGreaterThan(0);
    expect(openWo.length).toBeGreaterThan(0);
  });

  it("plans work orders to finish no earlier than they start", () => {
    for (const w of WORK_ORDERS) {
      expect(w.plannedEndDate >= w.plannedStartDate, w.orderNumber).toBe(true);
    }
  });
});
