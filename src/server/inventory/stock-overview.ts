import type { Prisma } from "@prisma/client";
import { toNumber, sumDecimals, type DecimalLike } from "@/server/api/decimal";

/**
 * Stock Overview — the per-material stock position, and the headline figures
 * above it.
 *
 * Pure: it takes rows already loaded from the database and returns the
 * response shape. The rules (what counts as low, what counts as dead) live
 * here, where they can be tested without a database.
 */

/** Stock that has not moved for this long counts as dead. */
export const DEAD_STOCK_DAYS = 90;

/**
 * - `critical`   on hand is at or below safety stock
 * - `low`        on hand is at or below the reorder point
 * - `adequate`   on hand is above the reorder point
 * - `unplanned`  no active planning policy in scope, so there is nothing to
 *                compare against — shown as such rather than guessed
 */
export type StockStatus = "adequate" | "low" | "critical" | "unplanned";

export interface Thresholds {
  reorderPoint: DecimalLike;
  safetyStock: DecimalLike;
}

/**
 * The status rule.
 *
 * Compares on-hand stock with the thresholds. Safety stock is checked first:
 * a material under its safety stock is also under its reorder point, and the
 * more urgent of the two is the one to report.
 */
export function classifyStock(onHand: DecimalLike, thresholds: Thresholds | null): StockStatus {
  if (!thresholds) return "unplanned";
  const qty = toNumber(onHand);
  if (qty <= toNumber(thresholds.safetyStock)) return "critical";
  if (qty <= toNumber(thresholds.reorderPoint)) return "low";
  return "adequate";
}

const severity: Record<StockStatus, number> = { unplanned: 0, adequate: 1, low: 2, critical: 3 };

/** The more urgent of two statuses. */
export function worstStatus(a: StockStatus, b: StockStatus): StockStatus {
  return severity[b] > severity[a] ? b : a;
}

/**
 * Days the stock at one location lasts at that location's average daily
 * demand, to one decimal place.
 *
 * Null when there is no demand figure, or it is zero — never estimated from
 * another location or a default, because a guessed cover figure is worse
 * than none: it would colour a cell green or red on no evidence.
 */
export function daysOfCover(onHand: DecimalLike, averageDailyDemand: DecimalLike | null | undefined): number | null {
  const demand = toNumber(averageDailyDemand ?? null);
  if (demand === null || demand <= 0) return null;
  const days = toNumber(onHand) / demand;
  return Math.max(0, Math.round(days * 10) / 10);
}

export interface OverviewMaterial {
  id: string;
  code: string;
  name: string;
  kind: string;
  standardCost: Prisma.Decimal | null;
  category: { name: string } | null;
  unitOfMeasure: { code: string };
}

export interface OverviewLocation {
  id: string;
  code: string;
  name: string;
}

export interface OverviewBalance {
  materialId: string;
  locationId: string;
  onHandQty: DecimalLike;
  reservedQty: DecimalLike;
  quarantineQty: DecimalLike;
  valuation: DecimalLike;
  lastMovementAt: Date | null;
}

export interface OverviewPolicy {
  materialId: string;
  locationId: string;
  reorderPoint: DecimalLike;
  safetyStock: DecimalLike;
  averageDailyDemand?: DecimalLike | null;
  procurementType?: "BUY" | "MAKE";
}

export interface StockOverviewInput {
  materials: OverviewMaterial[];
  locations: OverviewLocation[];
  balances: OverviewBalance[];
  /** Active policies only. */
  policies: OverviewPolicy[];
  /** Restrict to one location; null means every location in `locations`. */
  locationId: string | null;
  asOf: Date;
}

export interface StockOverviewRow {
  materialId: string;
  code: string;
  name: string;
  kind: string;
  category: string | null;
  uom: string;
  /** On-hand quantity keyed by location id, for every location in scope. */
  stockByLocation: Record<string, number>;
  /**
   * Days of cover keyed by location id, for every location in scope. Null
   * where that location has no positive average daily demand on its policy.
   */
  coverDaysByLocation: Record<string, number | null>;
  /** On-hand value keyed by location id, for every location in scope. */
  valueByLocation: Record<string, number>;
  onHand: number;
  reserved: number;
  quarantine: number;
  /**
   * Sum of the policies at the locations that have one, or null when no
   * location in scope has a policy. Never includes a value for a location
   * that has none.
   */
  reorderPoint: number | null;
  safetyStock: number | null;
  /** Locations whose policy the thresholds and status come from. */
  policyLocationIds: string[];
  /**
   * How the policies in scope replenish it: BUY, MAKE, MIXED when locations
   * differ, or null when there is no policy (or it does not say).
   */
  replenishment: "BUY" | "MAKE" | "MIXED" | null;
  /** Per stocking unit, company currency. */
  avgCost: number | null;
  /** On-hand value, company currency. */
  value: number;
  lastMovementAt: string | null;
  /** Stock on hand that has not moved for more than DEAD_STOCK_DAYS. */
  deadStock: boolean;
  status: StockStatus;
}

export interface StockOverviewSummary {
  totalSkus: number;
  totalValue: number;
  /** Low plus critical. */
  belowReorderPoint: number;
  critical: number;
  deadStockSkus: number;
  deadStockValue: number;
  /** The age threshold used for dead stock, so the UI can label it. */
  deadStockDays: number;
}

export interface StockOverview {
  asOf: string;
  locationId: string | null;
  locations: OverviewLocation[];
  rows: StockOverviewRow[];
  summary: StockOverviewSummary;
}

function replenishmentOf(policies: OverviewPolicy[]): StockOverviewRow["replenishment"] {
  const types = new Set(policies.map((p) => p.procurementType).filter((t) => t !== undefined));
  if (types.size === 0) return null;
  return types.size > 1 ? "MIXED" : [...types][0]!;
}

function groupByMaterial<T extends { materialId: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.materialId);
    if (list) list.push(item);
    else map.set(item.materialId, [item]);
  }
  return map;
}

export function buildStockOverview(input: StockOverviewInput): StockOverview {
  const { materials, locationId, asOf } = input;

  const locations = locationId
    ? input.locations.filter((l) => l.id === locationId)
    : input.locations;
  const inScope = new Set(locations.map((l) => l.id));

  const balancesByMaterial = groupByMaterial(input.balances.filter((b) => inScope.has(b.locationId)));
  const policiesByMaterial = groupByMaterial(input.policies.filter((p) => inScope.has(p.locationId)));

  const deadBefore = new Date(asOf.getTime() - DEAD_STOCK_DAYS * 86_400_000);

  const rows: StockOverviewRow[] = [];
  let totalValue = sumDecimals([]);
  let deadStockValue = sumDecimals([]);
  let deadStockSkus = 0;

  for (const m of materials) {
    const balances = balancesByMaterial.get(m.id) ?? [];
    const policies = policiesByMaterial.get(m.id) ?? [];

    // Filtered to one location, a material that is neither stocked nor
    // planned there is not part of that location's picture. Across all
    // locations every material is listed — a zero is itself worth seeing.
    if (locationId && balances.length === 0 && policies.length === 0) continue;

    const onHand = sumDecimals(balances.map((b) => b.onHandQty));
    const value = sumDecimals(balances.map((b) => b.valuation));

    /*
      Status is judged location by location: each location's stock against
      that location's own policy, and the row reports the most urgent result.
      Stock at a location with no policy never counts toward another
      location's thresholds — 200 kg in Mumbai does not cover a shortfall in
      Pune without a transfer, so adding it in would hide the shortage.
    */
    const onHandAt = new Map(balances.map((b) => [b.locationId, b.onHandQty]));
    const status = policies.length
      ? policies
          .map((p) => classifyStock(onHandAt.get(p.locationId) ?? 0, p))
          .reduce(worstStatus)
      : classifyStock(onHand, null);

    const stockByLocation: Record<string, number> = {};
    const valueByLocation: Record<string, number> = {};
    for (const l of locations) {
      stockByLocation[l.id] = 0;
      valueByLocation[l.id] = 0;
    }
    for (const b of balances) {
      stockByLocation[b.locationId] = toNumber(b.onHandQty);
      valueByLocation[b.locationId] = toNumber(b.valuation);
    }

    const demandAt = new Map(policies.map((p) => [p.locationId, p.averageDailyDemand]));
    const coverDaysByLocation: Record<string, number | null> = {};
    for (const l of locations) {
      coverDaysByLocation[l.id] = daysOfCover(onHandAt.get(l.id) ?? 0, demandAt.get(l.id));
    }

    const lastMovementAt = balances.reduce<Date | null>(
      (latest, b) => (b.lastMovementAt && (!latest || b.lastMovementAt > latest) ? b.lastMovementAt : latest),
      null,
    );

    const isDead = onHand.greaterThan(0) && (!lastMovementAt || lastMovementAt < deadBefore);
    if (isDead) {
      deadStockSkus += 1;
      deadStockValue = deadStockValue.plus(value);
    }
    totalValue = totalValue.plus(value);

    rows.push({
      materialId: m.id,
      code: m.code,
      name: m.name,
      kind: m.kind,
      category: m.category?.name ?? null,
      uom: m.unitOfMeasure.code,
      stockByLocation,
      coverDaysByLocation,
      valueByLocation,
      onHand: onHand.toNumber(),
      reserved: sumDecimals(balances.map((b) => b.reservedQty)).toNumber(),
      quarantine: sumDecimals(balances.map((b) => b.quarantineQty)).toNumber(),
      reorderPoint: policies.length ? sumDecimals(policies.map((p) => p.reorderPoint)).toNumber() : null,
      safetyStock: policies.length ? sumDecimals(policies.map((p) => p.safetyStock)).toNumber() : null,
      policyLocationIds: policies.map((p) => p.locationId),
      replenishment: replenishmentOf(policies),
      avgCost: toNumber(m.standardCost),
      value: value.toNumber(),
      lastMovementAt: lastMovementAt?.toISOString() ?? null,
      deadStock: isDead,
      status,
    });
  }

  const critical = rows.filter((r) => r.status === "critical").length;
  const low = rows.filter((r) => r.status === "low").length;

  return {
    asOf: asOf.toISOString(),
    locationId,
    locations,
    rows,
    summary: {
      totalSkus: rows.length,
      totalValue: totalValue.toNumber(),
      belowReorderPoint: critical + low,
      critical,
      deadStockSkus,
      deadStockValue: deadStockValue.toNumber(),
      deadStockDays: DEAD_STOCK_DAYS,
    },
  };
}
