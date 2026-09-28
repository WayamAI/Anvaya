import { describe, it, expect } from "vitest";
import {
  perParent, requiredForOrder, buildBomTree, flattenTree, whereUsed, effectivityProgress,
  type BomDef, type MaterialInfo,
} from "./bom";
import { BOM_FG001, BOM_SA101 } from "../../../prisma/seed/master-data";
import { WORK_ORDERS } from "../../../prisma/seed/operational-data";

const mat = (id: string, kind: string, uom: string, standardCost: number | null, leadTimeDays: number | null = 5): MaterialInfo => ({
  id, code: id, name: `Name ${id}`, kind, uom, standardCost, leadTimeDays, leadTimeSource: leadTimeDays === null ? null : "VENDOR",
});

const materials = new Map<string, MaterialInfo>([
  ["FG", mat("FG", "FINISHED", "UNIT", 690, 2)],
  ["SA", mat("SA", "SEMI_FINISHED", "L", 196, 1)],
  ["RM1", mat("RM1", "RAW", "KG", 185)],
  ["RM2", mat("RM2", "RAW", "L", 2)],
  ["PM", mat("PM", "PACKAGING", "PCS", 42)],
]);

const comp = (materialId: string, quantity: number, uom: string, scrapFactor = 0, position = 10) =>
  ({ materialId, position, quantity, uom, scrapFactor, leadTimeOffsetDays: 0, isOptional: false });

const SA: BomDef = {
  bomId: "b-sa", code: "BOM-SA", name: "SA", materialId: "SA", versionId: "v-sa", version: "A", baseQuantity: 100,
  components: [comp("RM1", 32, "KG", 0.02, 10), comp("RM2", 72, "L", 0, 20)],
};
const FG: BomDef = {
  bomId: "b-fg", code: "BOM-FG", name: "FG", materialId: "FG", versionId: "v-fg", version: "A", baseQuantity: 1,
  components: [comp("PM", 1, "PCS", 0.01, 20), comp("SA", 2.5, "L", 0.02, 10)],
};
const byMaterial = new Map([["SA", SA], ["FG", FG]]);

describe("perParent", () => {
  it("divides by the parent's base quantity, then applies scrap", () => {
    expect(perParent({ quantity: 32, scrapFactor: 0.02 }, 100)).toEqual({ net: 0.32, gross: 0.3264 });
    expect(perParent({ quantity: 2.5, scrapFactor: 0 }, 1)).toEqual({ net: 2.5, gross: 2.5 });
  });

  it("is zero for a non-positive base rather than dividing by it", () => {
    expect(perParent({ quantity: 5, scrapFactor: 0 }, 0)).toEqual({ net: 0, gross: 0 });
  });
});

describe("requiredForOrder matches the seeded work order snapshots", () => {
  // The same rule the seed used to snapshot components onto work orders.
  const boms = { "BOM-FG-001": BOM_FG001, "BOM-SA-101": BOM_SA101 } as const;
  const cases: [string, string, number][] = [
    ["WO-2026-0104", "RM-4023", 195.84],
    ["WO-2026-0108", "SA-101", 892.5],
    ["WO-2026-0091", "PM-3004", 83.35],
  ];
  it.each(cases)("%s %s", (orderNumber, material, expected) => {
    const wo = WORK_ORDERS.find((w) => w.orderNumber === orderNumber)!;
    const bom = boms[wo.bomCode as keyof typeof boms];
    const c = bom.components.find((x) => x.material === material)!;
    expect(requiredForOrder(c, bom.baseQuantity, wo.plannedQty)).toBe(expected);
  });
});

describe("buildBomTree", () => {
  const tree = buildBomTree(FG, byMaterial, materials);

  it("roots at one unit of the product and orders components by position", () => {
    expect(tree).toMatchObject({ code: "FG", level: 0, qtyPerParent: 1, qtyPerTop: 1, bom: { code: "BOM-FG" } });
    expect(tree.children.map((c) => c.code)).toEqual(["SA", "PM"]);
  });

  it("expands sub-assemblies with their own BOM", () => {
    const sa = tree.children[0];
    expect(sa).toMatchObject({ level: 1, qtyPerParent: 2.5, grossPerParent: 2.55, qtyPerTop: 2.55, bom: { code: "BOM-SA" } });
    expect(sa.children.map((c) => [c.code, c.qtyPerParent, c.grossPerParent])).toEqual([["RM1", 0.32, 0.3264], ["RM2", 0.72, 0.72]]);
  });

  it("multiplies scrap down every level for the per-product quantity", () => {
    // 2.5 × 1.02 × 0.32 × 1.02
    expect(tree.children[0].children[0].qtyPerTop).toBe(0.83232);
  });

  it("rolls materials cost up from the leaves, not the sub-assembly's standard cost", () => {
    const sa = tree.children[0];
    // 0.3264 × 185 + 0.72 × 2
    expect(sa.materialCost).toBe(61.824);
    expect(sa.extendedCost).toBe(157.6512);          // × 2.55
    expect(tree.children[1].extendedCost).toBe(42.42); // 1.01 × 42
    expect(tree.materialCost).toBe(200.0712);
    expect(tree.standardCost).toBe(690);
  });

  it("carries lead time for every node", () => {
    expect(flattenTree(tree).map((n) => n.leadTimeDays)).toEqual([2, 1, 5, 5, 5]);
  });

  it("makes the roll-up unknown when any leaf has no standard cost", () => {
    const m = new Map(materials).set("RM2", mat("RM2", "RAW", "L", null));
    const t = buildBomTree(FG, byMaterial, m);
    expect(t.children[0].materialCost).toBeNull();
    expect(t.materialCost).toBeNull();
    expect(t.children[1].extendedCost).toBe(42.42);
  });

  it("stops at a material that reappears beneath itself", () => {
    const loop: BomDef = { ...SA, components: [comp("FG", 1, "UNIT")] };
    const t = buildBomTree(FG, new Map([["FG", FG], ["SA", loop]]), materials);
    const again = t.children[0].children[0];
    expect(again).toMatchObject({ code: "FG", cycle: true, children: [], materialCost: null });
  });
});

describe("flattenTree", () => {
  it("lists parents before children, depth first", () => {
    expect(flattenTree(buildBomTree(FG, byMaterial, materials)).map((n) => `${n.level}:${n.code}`))
      .toEqual(["0:FG", "1:SA", "2:RM1", "2:RM2", "1:PM"]);
  });
});

describe("whereUsed", () => {
  it("finds direct parents and the products above them", () => {
    expect(whereUsed("RM1", [FG, SA], materials).map((w) => [w.product.code, w.direct, w.via.map((v) => v.code)]))
      .toEqual([["SA", true, []], ["FG", false, ["SA"]]]);
  });

  it("is empty for a material no BOM uses", () => {
    expect(whereUsed("FG", [FG, SA], materials)).toEqual([]);
  });

  it("terminates on a cycle", () => {
    const loop: BomDef = { ...SA, components: [comp("FG", 1, "UNIT")] };
    const out = whereUsed("FG", [FG, loop], materials);
    expect(out.map((w) => w.product.code)).toEqual(["SA"]);
  });
});

describe("effectivityProgress", () => {
  const from = new Date("2026-01-01T00:00:00Z");

  it("is the share of the period elapsed", () => {
    expect(effectivityProgress(from, new Date("2027-01-01T00:00:00Z"), new Date("2026-07-02T12:00:00Z"))).toBe(50);
  });

  it("clamps before the start and after the end", () => {
    expect(effectivityProgress(from, new Date("2026-02-01T00:00:00Z"), new Date("2025-06-01T00:00:00Z"))).toBe(0);
    expect(effectivityProgress(from, new Date("2026-02-01T00:00:00Z"), new Date("2026-09-24T00:00:00Z"))).toBe(100);
  });

  it("is null when open-ended or inverted", () => {
    expect(effectivityProgress(from, null, new Date())).toBeNull();
    expect(effectivityProgress(from, new Date("2025-12-01T00:00:00Z"), new Date())).toBeNull();
  });
});
