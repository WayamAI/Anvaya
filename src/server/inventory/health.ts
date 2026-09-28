import { daysBetween } from "./lots";
import type { StockOverview, StockOverviewRow, StockStatus } from "./stock-overview";

/**
 * Inventory health — scored from the Stock Overview data, never beside it.
 *
 * Every input here (status, value, days of cover, dead stock) comes from
 * buildStockOverview, so a material that Stock Overview calls Low is Low
 * here too, and the values add up to the same totals. This file only adds
 * the scoring on top.
 *
 * Scores are 0–100. A score that the data cannot support is null, not a
 * guess: turnover needs consumption history the stock ledger does not hold,
 * and there is no stored history to draw a trend from.
 */

/** The score the page measures itself against. */
export const HEALTH_TARGET = 80;

/** How many issues the recommendations panel lists. */
export const RECOMMENDATION_LIMIT = 5;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

/** Money sums to the column's four places, so float addition cannot drift. */
const money = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 1e4) / 1e4;

/* ---- Per material ---------------------------------------------------------- */

export type HealthIssue = "critical" | "low" | "dead" | "unplanned";

/** Most urgent first. */
const ISSUE_ORDER: HealthIssue[] = ["critical", "low", "dead", "unplanned"];

export interface MaterialHealth {
  materialId: string;
  code: string;
  name: string;
  category: string | null;
  uom: string;
  onHand: number;
  value: number;
  status: StockStatus;
  deadStock: boolean;
  /** Days since stock last moved; null when it never has. */
  idleDays: number | null;
  /** Shortest days of cover among locations that have a demand figure. */
  coverDays: number | null;
  /** From the planning policy: bought, made, or both across locations. */
  replenishment: StockOverviewRow["replenishment"];
  /** Null when neither availability nor movement can be judged. */
  score: number | null;
  /** The most urgent issue, or null when there is none. */
  issue: HealthIssue | null;
}

const AVAILABILITY_POINTS: Record<StockStatus, number | null> = {
  adequate: 100,
  low: 50,
  critical: 0,
  unplanned: null,
};

/**
 * A material's score is the mean of the parts that apply to it:
 *
 * - availability, from its Stock Overview status — 100 adequate, 50 low,
 *   0 critical; not applicable without a planning policy
 * - movement — 0 if it is dead stock, 100 otherwise; not applicable when
 *   nothing is on hand
 */
export function materialScore(row: Pick<StockOverviewRow, "status" | "onHand" | "deadStock">): number | null {
  const parts = [
    AVAILABILITY_POINTS[row.status],
    row.onHand > 0 ? (row.deadStock ? 0 : 100) : null,
  ].filter((p): p is number => p !== null);
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

/** The most urgent thing wrong with a material, or null. */
export function materialIssue(row: Pick<StockOverviewRow, "status" | "deadStock">): HealthIssue | null {
  if (row.status === "critical") return "critical";
  if (row.status === "low") return "low";
  if (row.deadStock) return "dead";
  if (row.status === "unplanned") return "unplanned";
  return null;
}

/** The shortest known cover across locations; null when none is known. */
export function shortestCover(coverDaysByLocation: Record<string, number | null>): number | null {
  const known = Object.values(coverDaysByLocation).filter((d): d is number => d !== null);
  return known.length ? Math.min(...known) : null;
}

export function toMaterialHealth(row: StockOverviewRow, asOf: Date): MaterialHealth {
  return {
    materialId: row.materialId,
    code: row.code,
    name: row.name,
    category: row.category,
    uom: row.uom,
    onHand: row.onHand,
    value: row.value,
    status: row.status,
    deadStock: row.deadStock,
    idleDays: row.lastMovementAt ? Math.max(0, daysBetween(new Date(row.lastMovementAt), asOf)) : null,
    coverDays: shortestCover(row.coverDaysByLocation),
    replenishment: row.replenishment,
    score: materialScore(row),
    issue: materialIssue(row),
  };
}

/** Worst score first; unscored last; ties broken by value at stake. */
function byUrgency(a: MaterialHealth, b: MaterialHealth) {
  if (a.score === null || b.score === null) return a.score === null ? (b.score === null ? 0 : 1) : -1;
  return a.score - b.score || b.value - a.value;
}

/**
 * The issues to act on first: critical before low before dead before
 * unplanned. Within a shortage, the least cover first (unknown cover last);
 * otherwise the most value at stake first.
 */
export function recommendations(materials: MaterialHealth[], limit = RECOMMENDATION_LIMIT): MaterialHealth[] {
  const rank = (m: MaterialHealth) => ISSUE_ORDER.indexOf(m.issue!);
  const cover = (m: MaterialHealth) => m.coverDays ?? Number.POSITIVE_INFINITY;
  return materials
    .filter((m) => m.issue !== null)
    .sort((a, b) =>
      rank(a) - rank(b) ||
      (a.issue === "critical" || a.issue === "low" ? cover(a) - cover(b) : 0) ||
      b.value - a.value)
    .slice(0, limit);
}

/* ---- Company level ---------------------------------------------------------- */

export interface HealthComponents {
  /** Planned materials above their reorder point. */
  availability: { score: number | null; adequate: number; planned: number };
  /** Not measurable yet: needs consumption over time. */
  turnover: { score: null; outboundMovements12m: number };
  /** Stock value that is still moving. */
  excess: { score: number | null; deadValue: number; totalValue: number; deadStockDays: number };
}

export interface HealthBreakdown {
  key: string;
  label: string;
  value: number;
  /** Share of total stock value, 0–100; null when there is no value. */
  share: number | null;
  /** Materials with stock on hand. */
  skus: number;
}

export interface InventoryHealth {
  asOf: string;
  target: number;
  overall: { score: number | null; basedOn: (keyof HealthComponents)[] };
  components: HealthComponents;
  materials: MaterialHealth[];
  recommendations: MaterialHealth[];
  byLocation: HealthBreakdown[];
  byCategory: (HealthBreakdown & { belowReorderPoint: number })[];
  totals: {
    value: number;
    skus: number;
    stockedSkus: number;
    belowReorderPoint: number;
    critical: number;
    deadStockSkus: number;
    deadStockValue: number;
  };
  /** No history is stored, so there is no trend to show. */
  trend: null;
}

export interface HealthExtras {
  /** Outbound ledger movements in the last 12 months. */
  outboundMovements12m: number;
}

/** Build the health view from an all-locations Stock Overview. */
export function buildInventoryHealth(overview: StockOverview, extras: HealthExtras): InventoryHealth {
  const asOf = new Date(overview.asOf);
  const { rows, summary, locations } = overview;

  const planned = rows.filter((r) => r.status !== "unplanned");
  const adequate = planned.filter((r) => r.status === "adequate").length;

  const components: HealthComponents = {
    availability: { score: pct(adequate, planned.length), adequate, planned: planned.length },
    turnover: { score: null, outboundMovements12m: extras.outboundMovements12m },
    excess: {
      score: summary.totalValue > 0 ? Math.round((1 - summary.deadStockValue / summary.totalValue) * 100) : null,
      deadValue: summary.deadStockValue,
      totalValue: summary.totalValue,
      deadStockDays: summary.deadStockDays,
    },
  };

  const available = (Object.keys(components) as (keyof HealthComponents)[])
    .filter((k) => components[k].score !== null);
  const overall = {
    score: available.length
      ? Math.round(available.reduce((s, k) => s + components[k].score!, 0) / available.length)
      : null,
    basedOn: available,
  };

  const materials = rows.map((r) => toMaterialHealth(r, asOf)).sort(byUrgency);
  const share = (v: number) => (summary.totalValue > 0 ? Math.round((v / summary.totalValue) * 1000) / 10 : null);

  const byLocation: HealthBreakdown[] = locations.map((l) => {
    const value = money(rows.map((r) => r.valueByLocation[l.id] ?? 0));
    return {
      key: l.id,
      label: l.name,
      value,
      share: share(value),
      skus: rows.filter((r) => (r.stockByLocation[l.id] ?? 0) > 0).length,
    };
  });

  const categories = new Map<string, StockOverviewRow[]>();
  for (const r of rows) {
    const key = r.category ?? "Uncategorised";
    categories.set(key, [...(categories.get(key) ?? []), r]);
  }
  const byCategory = [...categories.entries()]
    .map(([label, rs]) => {
      const value = money(rs.map((r) => r.value));
      return {
        key: label,
        label,
        value,
        share: share(value),
        skus: rs.filter((r) => r.onHand > 0).length,
        belowReorderPoint: rs.filter((r) => r.status === "low" || r.status === "critical").length,
      };
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return {
    asOf: overview.asOf,
    target: HEALTH_TARGET,
    overall,
    components,
    materials,
    recommendations: recommendations(materials),
    byLocation,
    byCategory,
    totals: {
      value: summary.totalValue,
      skus: summary.totalSkus,
      stockedSkus: rows.filter((r) => r.onHand > 0).length,
      belowReorderPoint: summary.belowReorderPoint,
      critical: summary.critical,
      deadStockSkus: summary.deadStockSkus,
      deadStockValue: summary.deadStockValue,
    },
    trend: null,
  };
}
