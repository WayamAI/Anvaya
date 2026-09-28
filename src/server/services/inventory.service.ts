import { prisma } from "@/server/db/client";
import { AppError } from "@/server/errors/app-error";
import { buildStockOverview } from "@/server/inventory/stock-overview";
import { buildInventoryHealth } from "@/server/inventory/health";
import { buildExhaustionAlerts, type VendorOption } from "@/server/inventory/exhaustion";
import { buildSafetyStock } from "@/server/inventory/safety-stock";
import { locationOrder } from "./location.service";
import type { StockOverviewQuery } from "@/server/validation/material";

/**
 * Inventory — read side.
 *
 * Loads the four inputs of the stock overview in parallel, each scoped to the
 * caller's company, and hands them to the pure builder. Four flat queries
 * rather than one deep include: the builder needs balances and policies
 * grouped by material *and* filtered by location, which is simpler and
 * cheaper to do in memory than to express as nested relation filters.
 */
export async function getStockOverview(companyId: string, query: StockOverviewQuery, asOf = new Date()) {
  const locations = await prisma.location.findMany({
    where: { companyId, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: locationOrder,
  });

  if (query.locationId && !locations.some((l) => l.id === query.locationId)) {
    throw AppError.notFound("Location", query.locationId);
  }

  const locationIds = locations.map((l) => l.id);

  const [materials, balances, policies] = await Promise.all([
    prisma.material.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, code: true, name: true, kind: true, standardCost: true,
        category: { select: { name: true } },
        unitOfMeasure: { select: { code: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.inventoryBalance.findMany({
      where: { locationId: { in: locationIds }, material: { companyId } },
      select: {
        materialId: true, locationId: true,
        onHandQty: true, reservedQty: true, quarantineQty: true,
        valuation: true, lastMovementAt: true,
      },
    }),
    prisma.materialLocationPolicy.findMany({
      where: { isActive: true, locationId: { in: locationIds }, material: { companyId } },
      select: {
        materialId: true, locationId: true,
        reorderPoint: true, safetyStock: true, averageDailyDemand: true, procurementType: true,
      },
    }),
  ]);

  return buildStockOverview({
    materials,
    locations,
    balances,
    policies,
    locationId: query.locationId ?? null,
    asOf,
  });
}

/**
 * Inventory health for every active location — the all-locations stock
 * overview with scoring on top, so both pages always agree on status, value,
 * days of cover and dead stock.
 */
export async function getInventoryHealth(companyId: string, asOf = new Date()) {
  const yearAgo = new Date(asOf.getTime() - 365 * 86_400_000);
  const [overview, outboundMovements12m] = await Promise.all([
    getStockOverview(companyId, {}, asOf),
    prisma.stockMovement.count({
      where: { quantity: { lt: 0 }, occurredAt: { gte: yearAgo, lte: asOf }, material: { companyId } },
    }),
  ]);
  return buildInventoryHealth(overview, { outboundMovements12m });
}

/**
 * What replenishment planning needs beyond stock: each active policy's
 * demand, buffer and lead-time settings, and each material's vendor options.
 * Shared by exhaustion alerts and safety stock so both take lead time from
 * the same place.
 */
export async function loadReplenishmentInputs(companyId: string) {
  const [policies, vendorMaterials] = await Promise.all([
    prisma.materialLocationPolicy.findMany({
      where: { isActive: true, material: { companyId }, location: { companyId, isActive: true } },
      select: {
        materialId: true, locationId: true, procurementType: true,
        averageDailyDemand: true, demandStdDev: true, serviceLevel: true, safetyStock: true,
        productionLeadTimeDays: true, safetyLeadTimeDays: true,
      },
    }),
    prisma.vendorMaterial.findMany({
      where: { isActive: true, material: { companyId }, vendor: { companyId, isActive: true } },
      select: { materialId: true, isPreferred: true, leadTimeDays: true, vendor: { select: { id: true, name: true } } },
    }),
  ]);

  const vendorsByMaterial = new Map<string, VendorOption[]>();
  for (const vm of vendorMaterials) {
    const list = vendorsByMaterial.get(vm.materialId) ?? [];
    list.push({ vendorId: vm.vendor.id, name: vm.vendor.name, leadTimeDays: vm.leadTimeDays, isPreferred: vm.isPreferred });
    vendorsByMaterial.set(vm.materialId, list);
  }
  return { policies, vendorsByMaterial };
}

/**
 * Stock exhaustion alerts across every active location. Stock and days of
 * cover come from the stock overview; lead time and vendor from the shared
 * replenishment inputs.
 */
export async function getExhaustionAlerts(companyId: string, asOf = new Date()) {
  const [overview, { policies, vendorsByMaterial }] = await Promise.all([
    getStockOverview(companyId, {}, asOf),
    loadReplenishmentInputs(companyId),
  ]);
  return buildExhaustionAlerts({ overview, policies, vendorsByMaterial, asOf });
}

/**
 * Current against recommended safety stock for every active policy, with
 * lead time chosen exactly as the exhaustion alerts choose it.
 */
export async function getSafetyStock(companyId: string, asOf = new Date()) {
  const [overview, { policies, vendorsByMaterial }] = await Promise.all([
    getStockOverview(companyId, {}, asOf),
    loadReplenishmentInputs(companyId),
  ]);
  return buildSafetyStock({ overview, policies, vendorsByMaterial });
}
