/**
 * Bills of material — the rules, free of the database.
 *
 * A component's `quantity` is per `baseQuantity` of its parent, so every
 * per-unit figure is derived by dividing (SA-101 lists 32 kg per 100 L, which
 * is 0.32 kg per litre). Scrap inflates the gross requirement, exactly as the
 * work order snapshot does: required = qty ÷ base × order qty × (1 + scrap).
 *
 * Sub-assemblies are expanded with their own active version. A material that
 * reappears beneath itself is marked as a cycle and not expanded again.
 */

/** Quantities are Decimal(18, 6); money Decimal(18, 4). */
const qty6 = (n: number) => Math.round(n * 1e6) / 1e6;
const money4 = (n: number) => Math.round(n * 1e4) / 1e4;

export interface BomComponentDef {
  materialId: string;
  position: number;
  quantity: number;
  uom: string;
  scrapFactor: number;
  leadTimeOffsetDays: number;
  isOptional: boolean;
}

export interface BomDef {
  bomId: string;
  code: string;
  name: string;
  materialId: string;
  versionId: string;
  version: string;
  baseQuantity: number;
  components: BomComponentDef[];
}

export interface MaterialInfo {
  id: string;
  code: string;
  name: string;
  kind: string;
  uom: string;
  standardCost: number | null;
  leadTimeDays: number | null;
  leadTimeSource: "VENDOR" | "PRODUCTION" | null;
}

export interface BomNode {
  materialId: string;
  code: string;
  name: string;
  kind: string;
  uom: string;
  /** Tree depth: 0 for the product itself. */
  level: number;
  /** Per one unit of the parent, before scrap. */
  qtyPerParent: number;
  scrapFactor: number;
  /** Per one unit of the parent, after scrap. */
  grossPerParent: number;
  /** Per one unit of the top product, after scrap at every level. */
  qtyPerTop: number;
  leadTimeDays: number | null;
  leadTimeSource: MaterialInfo["leadTimeSource"];
  leadTimeOffsetDays: number;
  isOptional: boolean;
  standardCost: number | null;
  /** The sub-assembly's own BOM, when it has one. */
  bom: { id: string; code: string; version: string } | null;
  /** Materials-only cost of one unit: rolled up from children, else standard cost. */
  materialCost: number | null;
  /** This line's materials cost per one unit of its parent. */
  extendedCost: number | null;
  /** Reappears beneath itself; not expanded again. */
  cycle: boolean;
  children: BomNode[];
}

/** Per-parent-unit quantity, before and after scrap. */
export function perParent(c: Pick<BomComponentDef, "quantity" | "scrapFactor">, baseQuantity: number) {
  const net = baseQuantity > 0 ? c.quantity / baseQuantity : 0;
  return { net: qty6(net), gross: qty6(net * (1 + c.scrapFactor)) };
}

/** What a work order for `orderQty` of the parent requires — the snapshot rule. */
export function requiredForOrder(c: Pick<BomComponentDef, "quantity" | "scrapFactor">, baseQuantity: number, orderQty: number) {
  return qty6((c.quantity / baseQuantity) * orderQty * (1 + c.scrapFactor));
}

function unknownMaterial(id: string): MaterialInfo {
  return { id, code: id, name: "Unknown material", kind: "UNKNOWN", uom: "", standardCost: null, leadTimeDays: null, leadTimeSource: null };
}

function expand(
  material: MaterialInfo,
  bom: BomDef | null,
  line: { qtyPerParent: number; grossPerParent: number; qtyPerTop: number; scrapFactor: number; leadTimeOffsetDays: number; isOptional: boolean },
  level: number,
  ancestors: Set<string>,
  bomsByMaterial: Map<string, BomDef>,
  materials: Map<string, MaterialInfo>,
): BomNode {
  const cycle = ancestors.has(material.id);
  const children: BomNode[] = [];

  if (bom && !cycle) {
    const path = new Set(ancestors).add(material.id);
    const sorted = [...bom.components].sort((a, b) => a.position - b.position);
    for (const c of sorted) {
      const child = materials.get(c.materialId) ?? unknownMaterial(c.materialId);
      const q = perParent(c, bom.baseQuantity);
      children.push(expand(
        child,
        bomsByMaterial.get(c.materialId) ?? null,
        {
          qtyPerParent: q.net,
          grossPerParent: q.gross,
          qtyPerTop: qty6(line.qtyPerTop * q.gross),
          scrapFactor: c.scrapFactor,
          leadTimeOffsetDays: c.leadTimeOffsetDays,
          isOptional: c.isOptional,
        },
        level + 1,
        path,
        bomsByMaterial,
        materials,
      ));
    }
  }

  // A made item's materials cost is what its children cost; a bought one's is
  // its standard cost. Any unknown cost below makes the roll-up unknown rather
  // than quietly low.
  const materialCost = children.length
    ? children.some((c) => c.extendedCost === null)
      ? null
      : money4(children.reduce((s, c) => s + (c.extendedCost ?? 0), 0))
    : cycle ? null : material.standardCost;

  return {
    materialId: material.id,
    code: material.code,
    name: material.name,
    kind: material.kind,
    uom: material.uom,
    level,
    ...line,
    leadTimeDays: material.leadTimeDays,
    leadTimeSource: material.leadTimeSource,
    standardCost: material.standardCost,
    bom: bom ? { id: bom.bomId, code: bom.code, version: bom.version } : null,
    materialCost,
    extendedCost: materialCost === null ? null : money4(materialCost * line.grossPerParent),
    cycle,
    children,
  };
}

/**
 * The full tree for `bom`, rooted at the product it makes (one unit of it).
 * Sub-assemblies use their own entry in `bomsByMaterial`.
 */
export function buildBomTree(bom: BomDef, bomsByMaterial: Map<string, BomDef>, materials: Map<string, MaterialInfo>): BomNode {
  const product = materials.get(bom.materialId) ?? unknownMaterial(bom.materialId);
  return expand(
    product,
    bom,
    { qtyPerParent: 1, grossPerParent: 1, qtyPerTop: 1, scrapFactor: 0, leadTimeOffsetDays: 0, isOptional: false },
    0,
    new Set(),
    bomsByMaterial,
    materials,
  );
}

/** Depth-first rows for display and CSV export, parents before children. */
export function flattenTree(root: BomNode): BomNode[] {
  const out: BomNode[] = [];
  const walk = (n: BomNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/* ---- Where-used ------------------------------------------------------------- */

export interface WhereUsed {
  /** The product whose BOM ultimately consumes the material. */
  product: { materialId: string; code: string; name: string };
  bomCode: string;
  /** Intermediate sub-assemblies between the material and the product, nearest first. */
  via: { materialId: string; code: string; name: string }[];
  direct: boolean;
}

/**
 * Every product that consumes `materialId`, directly or through
 * sub-assemblies, following each BOM's active version upwards.
 */
export function whereUsed(materialId: string, boms: BomDef[], materials: Map<string, MaterialInfo>): WhereUsed[] {
  const parentsOf = new Map<string, BomDef[]>();
  for (const b of boms) {
    for (const c of b.components) {
      parentsOf.set(c.materialId, [...(parentsOf.get(c.materialId) ?? []), b]);
    }
  }

  const ref = (id: string) => {
    const m = materials.get(id) ?? unknownMaterial(id);
    return { materialId: m.id, code: m.code, name: m.name };
  };

  const out: WhereUsed[] = [];
  const seen = new Set<string>();
  const climb = (id: string, via: string[], visited: Set<string>) => {
    for (const parent of parentsOf.get(id) ?? []) {
      if (visited.has(parent.materialId)) continue; // cycle guard
      const key = `${parent.materialId}|${via.join(">")}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ product: ref(parent.materialId), bomCode: parent.code, via: via.map(ref), direct: via.length === 0 });
      }
      climb(parent.materialId, [...via, parent.materialId], new Set(visited).add(parent.materialId));
    }
  };
  climb(materialId, [], new Set([materialId]));

  return out.sort((a, b) => Number(b.direct) - Number(a.direct) || a.product.code.localeCompare(b.product.code));
}

/* ---- Effectivity ------------------------------------------------------------ */

/**
 * How far through its effective period a version is, 0–100; null when it has
 * no end date (open-ended) or ends before it starts.
 */
export function effectivityProgress(from: Date, to: Date | null, asOf: Date): number | null {
  if (!to) return null;
  const span = to.getTime() - from.getTime();
  if (span <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((asOf.getTime() - from.getTime()) / span) * 100)));
}

/* ---- Response shapes (shared with the client as types only) ---------------------- */

export interface BomProduct {
  materialId: string;
  code: string;
  name: string;
  kind: string;
  bom: { id: string; code: string; activeVersion: string | null; versions: number; components: number } | null;
}

export interface BomVersionSummary {
  id: string;
  version: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseQuantity: number;
  components: number;
}

export interface BomView {
  asOf: string;
  bom: { id: string; code: string; name: string; description: string | null };
  version: BomVersionSummary & { effectivityProgress: number | null };
  versions: BomVersionSummary[];
  tree: BomNode;
  cost: {
    /** Materials only; null when any component's cost is unknown. */
    rolledMaterialCost: number | null;
    standardCost: number | null;
  };
}

export interface ComponentDetail {
  material: MaterialInfo & { isBatchTracked: boolean };
  procurementType: "BUY" | "MAKE" | null;
  stock: { total: number; byLocation: { locationId: string; name: string; onHand: number }[] };
  vendors: {
    primary: { id: string; name: string; leadTimeDays: number } | null;
    alternates: { id: string; name: string; leadTimeDays: number }[];
  };
  /** Null when the caller may not see purchasing data. */
  purchasing: {
    openLines: { purchaseOrderNumber: string; status: string; outstandingQty: number; expectedDate: string }[];
    lastPurchase: { unitPrice: number; purchaseOrderNumber: string; orderDate: string } | null;
  } | null;
  whereUsed: WhereUsed[];
}
