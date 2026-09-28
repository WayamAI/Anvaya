import { PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { toNumber } from "@/server/api/decimal";
import { chooseVendor, leadTime } from "@/server/inventory/exhaustion";
import { getStockOverview, loadReplenishmentInputs } from "./inventory.service";
import { isOpenPo } from "@/server/purchasing/purchase-orders";
import {
  buildBomTree, effectivityProgress, whereUsed,
  type BomDef, type BomProduct, type BomView, type BomVersionSummary, type ComponentDetail, type MaterialInfo,
} from "@/server/production/bom";

/**
 * Bills of material — read side. Every query is scoped by the caller's
 * company; a BOM or material from another company reads as not found.
 */

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function loadBomContext(companyId: string) {
  const [boms, materials, locations, { policies, vendorsByMaterial }] = await Promise.all([
    prisma.bom.findMany({
      where: { companyId },
      include: {
        versions: {
          include: { components: { include: { unitOfMeasure: { select: { code: true } } } } },
          orderBy: { effectiveFrom: "asc" },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.material.findMany({
      where: { companyId },
      select: {
        id: true, code: true, name: true, kind: true, standardCost: true, isBatchTracked: true, isActive: true,
        unitOfMeasure: { select: { code: true } },
      },
    }),
    prisma.location.findMany({ where: { companyId, isActive: true }, select: { id: true, isManufacturing: true } }),
    loadReplenishmentInputs(companyId),
  ]);

  /*
    Lead time follows the Alerts / Safety Stock rule, from one policy. A BOM
    is not tied to a location, so the policy is the one at the manufacturing
    location; failing that, the material's only policy. Several candidates
    and no way to choose between them means no lead time, not a guess.
  */
  const manufacturing = new Set(locations.filter((l) => l.isManufacturing).map((l) => l.id));
  const policyFor = (materialId: string) => {
    const all = policies.filter((p) => p.materialId === materialId);
    const atPlant = all.filter((p) => manufacturing.has(p.locationId));
    if (atPlant.length === 1) return atPlant[0];
    if (atPlant.length === 0 && all.length === 1) return all[0];
    return null;
  };

  const info = new Map<string, MaterialInfo & { isBatchTracked: boolean; procurementType: "BUY" | "MAKE" | null }>();
  for (const m of materials) {
    const policy = policyFor(m.id);
    const vendor = policy?.procurementType === "BUY" ? chooseVendor(vendorsByMaterial.get(m.id) ?? []) : null;
    const lead = policy
      ? leadTime({
          procurementType: policy.procurementType,
          vendorLeadTimeDays: vendor?.leadTimeDays ?? null,
          productionLeadTimeDays: policy.productionLeadTimeDays,
          safetyLeadTimeDays: policy.safetyLeadTimeDays,
        })
      : { days: null, source: null };
    info.set(m.id, {
      id: m.id, code: m.code, name: m.name, kind: m.kind, uom: m.unitOfMeasure.code,
      standardCost: toNumber(m.standardCost), leadTimeDays: lead.days, leadTimeSource: lead.source,
      isBatchTracked: m.isBatchTracked, procurementType: policy?.procurementType ?? null,
    });
  }

  const toDef = (b: (typeof boms)[number], v: (typeof boms)[number]["versions"][number]): BomDef => ({
    bomId: b.id, code: b.code, name: b.name, materialId: b.materialId,
    versionId: v.id, version: v.version, baseQuantity: toNumber(v.baseQuantity),
    components: v.components.map((c) => ({
      materialId: c.materialId, position: c.position, quantity: toNumber(c.quantity),
      uom: c.unitOfMeasure.code, scrapFactor: toNumber(c.scrapFactor),
      leadTimeOffsetDays: c.leadTimeOffsetDays, isOptional: c.isOptional,
    })),
  });

  // Each material's active BOM — what sub-assemblies expand with.
  const activeDefs: BomDef[] = [];
  const activeByMaterial = new Map<string, BomDef>();
  for (const b of boms) {
    const v = b.versions.find((x) => x.isActive);
    if (!v) continue;
    const def = toDef(b, v);
    activeDefs.push(def);
    if (!activeByMaterial.has(b.materialId)) activeByMaterial.set(b.materialId, def);
  }

  return { boms, materials, info, vendorsByMaterial, activeDefs, activeByMaterial, toDef };
}

const versionSummary = (v: { id: string; version: string; isActive: boolean; effectiveFrom: Date; effectiveTo: Date | null; baseQuantity: unknown; components: unknown[] }): BomVersionSummary => ({
  id: v.id,
  version: v.version,
  isActive: v.isActive,
  effectiveFrom: isoDate(v.effectiveFrom)!,
  effectiveTo: isoDate(v.effectiveTo),
  baseQuantity: toNumber(v.baseQuantity as never),
  components: v.components.length,
});

/**
 * Products that are made — finished and semi-finished goods, and anything
 * else that has a BOM — each with its BOM, or null when none is recorded.
 */
export async function listBomProducts(companyId: string): Promise<BomProduct[]> {
  const { boms, materials } = await loadBomContext(companyId);
  const bomByMaterial = new Map<string, (typeof boms)[number]>();
  for (const b of boms) if (!bomByMaterial.has(b.materialId)) bomByMaterial.set(b.materialId, b);

  return materials
    .filter((m) => m.isActive && (m.kind === "FINISHED" || m.kind === "SEMI_FINISHED" || bomByMaterial.has(m.id)))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((m) => {
      const b = bomByMaterial.get(m.id);
      const active = b?.versions.find((v) => v.isActive);
      return {
        materialId: m.id, code: m.code, name: m.name, kind: m.kind,
        bom: b
          ? { id: b.id, code: b.code, activeVersion: active?.version ?? null, versions: b.versions.length, components: active?.components.length ?? 0 }
          : null,
      };
    });
}

/** One BOM's tree for its active version, or the version named. */
export async function getBom(companyId: string, bomId: string, versionLabel?: string, asOf = new Date()): Promise<BomView> {
  const ctx = await loadBomContext(companyId);
  const bom = ctx.boms.find((b) => b.id === bomId);
  if (!bom) throw AppError.notFound("BOM", bomId);

  const version = versionLabel
    ? bom.versions.find((v) => v.version === versionLabel)
    : bom.versions.find((v) => v.isActive) ?? bom.versions[bom.versions.length - 1];
  if (!version) throw AppError.notFound(versionLabel ? "BOM version" : "BOM version for this BOM", versionLabel);

  const tree = buildBomTree(ctx.toDef(bom, version), ctx.activeByMaterial, ctx.info);

  return {
    asOf: asOf.toISOString(),
    bom: { id: bom.id, code: bom.code, name: bom.name, description: bom.description },
    version: { ...versionSummary(version), effectivityProgress: effectivityProgress(version.effectiveFrom, version.effectiveTo, asOf) },
    versions: bom.versions.map(versionSummary),
    tree,
    cost: { rolledMaterialCost: tree.materialCost, standardCost: tree.standardCost },
  };
}

/**
 * One component: stock (as Stock Overview reports it), lead time and
 * vendors, where it is used, and — for callers allowed to see purchasing —
 * open purchase order lines and the last price paid.
 */
export async function getComponentDetail(companyId: string, materialId: string, canSeePurchasing: boolean, asOf = new Date()): Promise<ComponentDetail> {
  const ctx = await loadBomContext(companyId);
  const material = ctx.info.get(materialId);
  if (!material) throw AppError.notFound("Material", materialId);

  const [overview, lines] = await Promise.all([
    getStockOverview(companyId, {}, asOf),
    canSeePurchasing
      ? prisma.purchaseOrderLine.findMany({
          where: { materialId, purchaseOrder: { companyId, status: { not: PurchaseOrderStatus.CANCELLED } } },
          select: {
            orderedQty: true, receivedQty: true, unitPrice: true, expectedDeliveryDate: true,
            purchaseOrder: { select: { orderNumber: true, status: true, orderDate: true } },
          },
          orderBy: [{ purchaseOrder: { orderDate: "desc" } }, { purchaseOrder: { orderNumber: "desc" } }],
        })
      : Promise.resolve(null),
  ]);

  const row = overview.rows.find((r) => r.materialId === materialId);
  const byLocation = overview.locations
    .map((l) => ({ locationId: l.id, name: l.name, onHand: row?.stockByLocation[l.id] ?? 0 }))
    .filter((l) => l.onHand !== 0);

  const options = ctx.vendorsByMaterial.get(materialId) ?? [];
  const primary = material.procurementType === "MAKE" ? null : chooseVendor(options);

  let purchasing: ComponentDetail["purchasing"] = null;
  if (lines) {
    const open = lines
      .filter((l) => isOpenPo(l.purchaseOrder.status))
      .map((l) => ({
        purchaseOrderNumber: l.purchaseOrder.orderNumber,
        status: l.purchaseOrder.status,
        outstandingQty: Math.max(0, toNumber(l.orderedQty) - toNumber(l.receivedQty)),
        expectedDate: isoDate(l.expectedDeliveryDate)!,
      }))
      .filter((l) => l.outstandingQty > 0)
      .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
    // Drafts are not a price anyone agreed to.
    const priced = lines.find((l) => l.purchaseOrder.status !== PurchaseOrderStatus.DRAFT);
    purchasing = {
      openLines: open,
      lastPurchase: priced
        ? { unitPrice: toNumber(priced.unitPrice), purchaseOrderNumber: priced.purchaseOrder.orderNumber, orderDate: isoDate(priced.purchaseOrder.orderDate)! }
        : null,
    };
  }

  const { procurementType, ...materialInfo } = material;
  return {
    material: materialInfo,
    procurementType,
    stock: { total: row?.onHand ?? 0, byLocation },
    vendors: {
      primary: primary ? { id: primary.vendorId, name: primary.name, leadTimeDays: primary.leadTimeDays } : null,
      alternates: options
        .filter((o) => o.vendorId !== primary?.vendorId)
        .map((o) => ({ id: o.vendorId, name: o.name, leadTimeDays: o.leadTimeDays })),
    },
    purchasing,
    whereUsed: whereUsed(materialId, ctx.activeDefs, ctx.info),
  };
}
