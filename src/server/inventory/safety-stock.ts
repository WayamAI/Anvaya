import { toNumber, type DecimalLike } from "@/server/api/decimal";
import { chooseVendor, leadTime, type LeadTime, type VendorOption } from "./exhaustion";
import { classifyStock, type StockOverview } from "./stock-overview";

/**
 * Safety stock — the buffer each policy holds against the one the demand
 * data says it should.
 *
 *   recommended = Z × σ(daily demand) × √(lead time in days)
 *
 * Z comes from the policy's target cycle service level. Lead time is chosen
 * exactly as the exhaustion alerts choose it (leadTime + chooseVendor), so a
 * material has one lead time wherever it appears. Stock and material details
 * come from the Stock Overview rows.
 *
 * Any missing input makes the recommendation null, with the reason — never a
 * default service level, a default lead time or an estimated spread.
 */

/* ---- Z for a service level --------------------------------------------------- */

/**
 * Inverse of the standard normal CDF (Acklam's rational approximation,
 * relative error < 1.2e-9): the Z whose cumulative probability is `p`.
 * Null outside (0, 1), where no finite Z exists.
 */
export function zForServiceLevel(p: number): number | null {
  if (!(p > 0 && p < 1)) return null;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/* ---- Recommendation ------------------------------------------------------------ */

export type UnavailableReason = "NO_STD_DEV" | "NO_SERVICE_LEVEL" | "NO_LEAD_TIME";

export interface Recommendation {
  /** Rounded up to a whole stocking unit — a buffer is never rounded down. */
  value: number | null;
  z: number | null;
  reason: UnavailableReason | null;
}

export function recommendedSafetyStock(input: {
  demandStdDev: number | null;
  serviceLevel: number | null;
  leadTimeDays: number | null;
}): Recommendation {
  const { demandStdDev: sd, serviceLevel, leadTimeDays } = input;
  if (sd === null || sd < 0) return { value: null, z: null, reason: "NO_STD_DEV" };
  const z = serviceLevel === null ? null : zForServiceLevel(serviceLevel);
  if (z === null) return { value: null, z: null, reason: "NO_SERVICE_LEVEL" };
  if (leadTimeDays === null || leadTimeDays < 0) return { value: null, z, reason: "NO_LEAD_TIME" };
  // A tiny epsilon keeps an exact whole result (e.g. 280.0000000001) from
  // rounding up a unit. A buffer is never negative: a service level under
  // 50% gives a negative Z, and 0 - epsilon would otherwise ceil to -0.
  return { value: Math.max(0, Math.ceil(z * sd * Math.sqrt(leadTimeDays) - 1e-9)), z, reason: null };
}

/* ---- Variability ------------------------------------------------------------------ */

export type Variability = "Low" | "Medium" | "High";

/**
 * Coefficient of variation (σ ÷ mean daily demand):
 * under 0.15 Low, under 0.30 Medium, otherwise High. Null without a positive
 * mean or a spread.
 */
export function variability(mean: number | null, sd: number | null): Variability | null {
  if (mean === null || mean <= 0 || sd === null || sd < 0) return null;
  const cv = sd / mean;
  return cv < 0.15 ? "Low" : cv < 0.3 ? "Medium" : "High";
}

/* ---- Page model -------------------------------------------------------------------- */

export interface SafetyStockPolicy {
  materialId: string;
  locationId: string;
  procurementType: "BUY" | "MAKE";
  averageDailyDemand: DecimalLike | null;
  demandStdDev: DecimalLike | null;
  serviceLevel: DecimalLike | null;
  safetyStock: DecimalLike;
  productionLeadTimeDays: number;
  safetyLeadTimeDays: number;
}

export interface SafetyStockRow {
  materialId: string;
  code: string;
  name: string;
  category: string | null;
  uom: string;
  location: { id: string; name: string };
  procurementType: "BUY" | "MAKE";
  averageDailyDemand: number | null;
  demandStdDev: number | null;
  serviceLevel: number | null;
  z: number | null;
  leadTimeDays: number | null;
  leadTimeSource: LeadTime["source"];
  vendor: { id: string; name: string } | null;
  variability: Variability | null;
  current: number;
  recommended: number | null;
  /** current − recommended: negative means under-buffered. Null when not recommended. */
  gap: number | null;
  unavailableReason: UnavailableReason | null;
  /** On hand at this location. */
  onHand: number;
  /** On hand is at or below the current safety stock — Stock Overview's "critical" rule. */
  belowSafetyStock: boolean;
}

export interface SafetyStockView {
  asOf: string;
  rows: SafetyStockRow[];
  summary: {
    /** Policies holding a buffer above zero. */
    withSafetyStock: number;
    /** Policy locations whose stock is at or below their safety stock now. */
    belowSafetyStock: number;
    /** Policies with a zero buffer, plus stock held where there is no policy. */
    noBuffer: number;
    /** Policies whose current buffer is under the recommendation. */
    underRecommended: number;
    /** Policies a recommendation could not be calculated for. */
    unavailable: number;
  };
}

export function buildSafetyStock(input: {
  overview: StockOverview;
  policies: SafetyStockPolicy[];
  vendorsByMaterial: Map<string, VendorOption[]>;
}): SafetyStockView {
  const { overview } = input;
  const rowById = new Map(overview.rows.map((r) => [r.materialId, r]));
  const locationById = new Map(overview.locations.map((l) => [l.id, l]));

  const rows: SafetyStockRow[] = [];
  for (const p of input.policies) {
    const material = rowById.get(p.materialId);
    const location = locationById.get(p.locationId);
    // Inactive materials and locations are outside the overview, and so here.
    if (!material || !location) continue;

    const vendor = p.procurementType === "BUY" ? chooseVendor(input.vendorsByMaterial.get(p.materialId) ?? []) : null;
    const lead = leadTime({
      procurementType: p.procurementType,
      vendorLeadTimeDays: vendor?.leadTimeDays ?? null,
      productionLeadTimeDays: p.productionLeadTimeDays,
      safetyLeadTimeDays: p.safetyLeadTimeDays,
    });

    const mean = toNumber(p.averageDailyDemand ?? null);
    const sd = toNumber(p.demandStdDev ?? null);
    const serviceLevel = toNumber(p.serviceLevel ?? null);
    const current = toNumber(p.safetyStock);
    const rec = recommendedSafetyStock({ demandStdDev: sd, serviceLevel, leadTimeDays: lead.days });
    const onHand = material.stockByLocation[p.locationId] ?? 0;

    rows.push({
      materialId: material.materialId,
      code: material.code,
      name: material.name,
      category: material.category,
      uom: material.uom,
      location: { id: location.id, name: location.name },
      procurementType: p.procurementType,
      averageDailyDemand: mean,
      demandStdDev: sd,
      serviceLevel,
      z: rec.z === null ? null : Math.round(rec.z * 1000) / 1000,
      leadTimeDays: lead.days,
      leadTimeSource: lead.source,
      vendor: vendor ? { id: vendor.vendorId, name: vendor.name } : null,
      variability: variability(mean, sd),
      current,
      recommended: rec.value,
      gap: rec.value === null ? null : current - rec.value,
      unavailableReason: rec.reason,
      onHand,
      belowSafetyStock: classifyStock(onHand, { reorderPoint: 0, safetyStock: current }) === "critical",
    });
  }

  // Most under-buffered first; unavailable recommendations last.
  rows.sort((a, b) =>
    a.gap === null || b.gap === null
      ? (a.gap === null ? 1 : 0) - (b.gap === null ? 1 : 0) || a.code.localeCompare(b.code)
      : a.gap - b.gap || a.code.localeCompare(b.code));

  // Stock held somewhere with no policy at all has no buffer either.
  const policyKeys = new Set(input.policies.map((p) => `${p.materialId}|${p.locationId}`));
  let unplannedStock = 0;
  for (const r of overview.rows) {
    for (const l of overview.locations) {
      if ((r.stockByLocation[l.id] ?? 0) > 0 && !policyKeys.has(`${r.materialId}|${l.id}`)) unplannedStock += 1;
    }
  }

  return {
    asOf: overview.asOf,
    rows,
    summary: {
      withSafetyStock: rows.filter((r) => r.current > 0).length,
      belowSafetyStock: rows.filter((r) => r.belowSafetyStock).length,
      noBuffer: rows.filter((r) => r.current <= 0).length + unplannedStock,
      underRecommended: rows.filter((r) => r.gap !== null && r.gap < 0).length,
      unavailable: rows.filter((r) => r.recommended === null).length,
    },
  };
}
