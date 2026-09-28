import { toNumber, type DecimalLike } from "@/server/api/decimal";
import { startOfUtcDay } from "./lots";
import type { StockOverview } from "./stock-overview";

/**
 * Stock exhaustion alerts — when each material runs out at each location,
 * and when it must be reordered to arrive in time.
 *
 * Days of cover is taken from the Stock Overview rows (coverDaysByLocation),
 * never recomputed, so an alert always agrees with Multi-location. A location
 * without a daily demand figure has no cover and therefore no alert: it is
 * counted as not assessed, not guessed at.
 */

export type AlertLevel = "critical" | "high" | "medium";

/**
 * - critical  under 3 days of cover
 * - high      3 to under 7 days
 * - medium    7 to 14 days
 * - none      more than 14 days
 */
export function alertLevel(coverDays: number): AlertLevel | null {
  if (coverDays < 3) return "critical";
  if (coverDays < 7) return "high";
  if (coverDays <= 14) return "medium";
  return null;
}

const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(startOfUtcDay(d).getTime() + n * DAY_MS);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/* ---- Lead time ------------------------------------------------------------- */

export interface LeadTimeInput {
  procurementType: "BUY" | "MAKE";
  /** The chosen vendor's lead time; null when no vendor can be chosen. */
  vendorLeadTimeDays: number | null;
  productionLeadTimeDays: number;
  safetyLeadTimeDays: number;
}

export interface LeadTime {
  days: number | null;
  source: "VENDOR" | "PRODUCTION" | null;
}

/**
 * Bought materials take the vendor's lead time; made ones the policy's
 * production lead time. Safety lead time is added to either. A bought
 * material with no usable vendor has no lead time — not a default one.
 */
export function leadTime(input: LeadTimeInput): LeadTime {
  if (input.procurementType === "MAKE") {
    return { days: input.productionLeadTimeDays + input.safetyLeadTimeDays, source: "PRODUCTION" };
  }
  if (input.vendorLeadTimeDays === null) return { days: null, source: null };
  return { days: input.vendorLeadTimeDays + input.safetyLeadTimeDays, source: "VENDOR" };
}

/* ---- Vendor ---------------------------------------------------------------- */

export interface VendorOption {
  vendorId: string;
  name: string;
  leadTimeDays: number;
  isPreferred: boolean;
}

/**
 * The vendor to reorder from: the preferred one, or the only one when there
 * is just one. Several vendors and none preferred is ambiguous, so null.
 */
export function chooseVendor(options: VendorOption[]): VendorOption | null {
  const preferred = options.filter((o) => o.isPreferred);
  if (preferred.length === 1) return preferred[0];
  if (preferred.length === 0 && options.length === 1) return options[0];
  return null;
}

/* ---- Dates ----------------------------------------------------------------- */

/** The day stock runs out: today plus whole days of cover. */
export function requiredBy(asOf: Date, coverDays: number): Date {
  return addDays(asOf, Math.floor(Math.max(0, coverDays)));
}

/**
 * The last day to place the order and still receive it before stock runs out.
 * `immediate` when that day is today or already past; null date when the
 * lead time is unknown.
 */
export function reorderBy(asOf: Date, required: Date, leadTimeDays: number | null): { date: Date | null; immediate: boolean } {
  if (leadTimeDays === null) return { date: null, immediate: false };
  const date = addDays(required, -leadTimeDays);
  return { date, immediate: date.getTime() <= startOfUtcDay(asOf).getTime() };
}

/* ---- Alerts ---------------------------------------------------------------- */

export interface AlertPolicy {
  materialId: string;
  locationId: string;
  averageDailyDemand: DecimalLike | null;
  procurementType: "BUY" | "MAKE";
  productionLeadTimeDays: number;
  safetyLeadTimeDays: number;
}

export interface ExhaustionAlert {
  materialId: string;
  code: string;
  name: string;
  uom: string;
  location: { id: string; name: string };
  level: AlertLevel;
  stock: number;
  dailyUse: number;
  coverDays: number;
  /** ISO date stock runs out. */
  requiredBy: string;
  procurementType: "BUY" | "MAKE";
  leadTimeDays: number | null;
  leadTimeSource: LeadTime["source"];
  /** ISO date; null when the lead time is unknown. */
  reorderBy: string | null;
  reorderImmediate: boolean;
  vendor: { id: string; name: string } | null;
}

export interface ExhaustionAlerts {
  asOf: string;
  alerts: ExhaustionAlert[];
  counts: Record<AlertLevel | "total", number>;
  /** Material-locations holding stock but with no demand figure to judge. */
  notAssessed: number;
  thresholds: { critical: number; high: number; medium: number };
}

export interface ExhaustionInput {
  /** An all-locations stock overview. */
  overview: StockOverview;
  policies: AlertPolicy[];
  vendorsByMaterial: Map<string, VendorOption[]>;
  asOf: Date;
}

export function buildExhaustionAlerts(input: ExhaustionInput): ExhaustionAlerts {
  const { overview, asOf } = input;
  const policyAt = new Map(input.policies.map((p) => [`${p.materialId}|${p.locationId}`, p]));

  const alerts: ExhaustionAlert[] = [];
  let notAssessed = 0;

  for (const row of overview.rows) {
    for (const loc of overview.locations) {
      const stock = row.stockByLocation[loc.id] ?? 0;
      const cover = row.coverDaysByLocation[loc.id] ?? null;
      const policy = policyAt.get(`${row.materialId}|${loc.id}`);
      const demand = policy ? toNumber(policy.averageDailyDemand ?? null) : null;

      if (cover === null || !policy || demand === null || demand <= 0) {
        if (stock > 0) notAssessed += 1;
        continue;
      }

      const level = alertLevel(cover);
      if (!level) continue;

      const vendor = policy.procurementType === "BUY" ? chooseVendor(input.vendorsByMaterial.get(row.materialId) ?? []) : null;
      const lead = leadTime({
        procurementType: policy.procurementType,
        vendorLeadTimeDays: vendor?.leadTimeDays ?? null,
        productionLeadTimeDays: policy.productionLeadTimeDays,
        safetyLeadTimeDays: policy.safetyLeadTimeDays,
      });
      const required = requiredBy(asOf, cover);
      const reorder = reorderBy(asOf, required, lead.days);

      alerts.push({
        materialId: row.materialId,
        code: row.code,
        name: row.name,
        uom: row.uom,
        location: { id: loc.id, name: loc.name },
        level,
        stock,
        dailyUse: demand,
        coverDays: cover,
        requiredBy: isoDate(required),
        procurementType: policy.procurementType,
        leadTimeDays: lead.days,
        leadTimeSource: lead.source,
        reorderBy: reorder.date ? isoDate(reorder.date) : null,
        reorderImmediate: reorder.immediate,
        vendor: vendor ? { id: vendor.vendorId, name: vendor.name } : null,
      });
    }
  }

  alerts.sort((a, b) => a.coverDays - b.coverDays || a.code.localeCompare(b.code) || a.location.name.localeCompare(b.location.name));

  const count = (l: AlertLevel) => alerts.filter((a) => a.level === l).length;
  return {
    asOf: overview.asOf,
    alerts,
    counts: { critical: count("critical"), high: count("high"), medium: count("medium"), total: alerts.length },
    notAssessed,
    thresholds: { critical: 3, high: 7, medium: 14 },
  };
}
