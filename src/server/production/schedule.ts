import { startOfUtcDay } from "@/server/inventory/lots";
import { workCentreRoute, type WorkOrderStatus } from "./work-orders";

/**
 * Production schedule — the rules, free of the database.
 *
 * Only what the data records is placed: an order occupies each work centre on
 * its route for its whole planned window, in whole days. Operations carry no
 * dates of their own, so no sequence or time of day is inferred inside that
 * window. Capacity is compared only where the order's unit and the
 * constraint's unit are the same thing.
 */

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Inclusive whole days from `start` to `end`. */
export const spanDays = (startIso: string, endIso: string) =>
  Math.round((day(endIso).getTime() - day(startIso).getTime()) / DAY_MS) + 1;
export const addDaysIso = (iso: string, n: number) => isoDate(new Date(day(iso).getTime() + n * DAY_MS));

/* ---- Inputs ------------------------------------------------------------------ */

export interface ScheduleOrderInput {
  id: string;
  orderNumber: string;
  product: { id: string; code: string; name: string };
  uom: string;
  location: { id: string; name: string };
  plannedQty: number;
  plannedStartDate: string;
  plannedEndDate: string;
  status: WorkOrderStatus;
  overdue: boolean;
  operations: { sequence: number; workCentre: string | null; setupMinutes: number; runMinutes: number }[];
  /** Null once the order is finished; otherwise the components stock does not cover. */
  shortages: { materialId: string; code: string; name: string; uom: string; shortfall: number }[] | null;
}

export interface StoredConstraint {
  id: string;
  name: string;
  type: "CAPACITY" | "LABOUR" | "EQUIPMENT" | "MATERIAL" | "REGULATORY";
  location: { id: string; name: string };
  unit: string | null;
  capacity: number | null;
  /** As stored — not derived from any order. */
  utilised: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/* ---- Bars -------------------------------------------------------------------- */

export interface ScheduleBar {
  orderId: string;
  orderNumber: string;
  product: { code: string; name: string };
  workCentre: string;
  start: string;
  end: string;
  days: number;
  setupMinutes: number;
  runMinutes: number;
  status: WorkOrderStatus;
  overdue: boolean;
}

/**
 * One bar per order per work centre on its route (in operation order), over
 * the order's whole planned window. Minutes are summed when a work centre
 * appears on more than one operation. Cancelled orders occupy nothing.
 */
export function buildBars(orders: ScheduleOrderInput[]): ScheduleBar[] {
  const bars: ScheduleBar[] = [];
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    const byCentre = new Map<string, ScheduleBar>();
    for (const op of [...o.operations].sort((a, b) => a.sequence - b.sequence)) {
      if (!op.workCentre) continue;
      const bar = byCentre.get(op.workCentre) ?? {
        orderId: o.id, orderNumber: o.orderNumber, product: { code: o.product.code, name: o.product.name },
        workCentre: op.workCentre, start: o.plannedStartDate, end: o.plannedEndDate,
        days: spanDays(o.plannedStartDate, o.plannedEndDate), setupMinutes: 0, runMinutes: 0,
        status: o.status, overdue: o.overdue,
      };
      bar.setupMinutes += op.setupMinutes;
      bar.runMinutes += op.runMinutes;
      byCentre.set(op.workCentre, bar);
    }
    bars.push(...byCentre.values());
  }
  return bars;
}

/** Work centres in the order they first appear on any route. */
export function workCentres(bars: ScheduleBar[]): string[] {
  return [...new Set(bars.map((b) => b.workCentre))];
}

/* ---- Overlaps ------------------------------------------------------------------ */

export interface Overlap {
  workCentre: string;
  orders: [string, string];
  from: string;
  to: string;
}

/** Two orders on the same work centre whose whole-day windows share a day. */
export function findOverlaps(bars: ScheduleBar[]): Overlap[] {
  const out: Overlap[] = [];
  for (const wc of workCentres(bars)) {
    const on = bars.filter((b) => b.workCentre === wc).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i];
        const b = on[j];
        if (a.orderId === b.orderId || b.start > a.end) continue;
        out.push({
          workCentre: wc,
          orders: [a.orderNumber, b.orderNumber],
          from: b.start > a.start ? b.start : a.start,
          to: a.end < b.end ? a.end : b.end,
        });
      }
    }
  }
  return out;
}

/* ---- Capacity ------------------------------------------------------------------ */

/**
 * The stocking unit a constraint's unit measures, when it is recognisably
 * one — "litres/day" → L. Null for anything else (hours, shifts, …).
 */
export function unitOfConstraint(unit: string | null): string | null {
  const base = unit?.split("/")[0]?.trim().toLowerCase();
  if (!base) return null;
  if (["l", "litre", "litres", "liter", "liters"].includes(base)) return "L";
  if (["kg", "kgs", "kilogram", "kilograms"].includes(base)) return "KG";
  if (["unit", "units"].includes(base)) return "UNIT";
  if (["pc", "pcs", "piece", "pieces"].includes(base)) return "PCS";
  return null;
}

/** Only per-day capacities can be compared with a daily planned load. */
export const isPerDay = (unit: string | null) => /\/\s*day$/i.test(unit ?? "");

/** A capacity constraint names the work centre it limits: "Blending line BLEND-01". */
export function constraintFor(workCentre: string, locationId: string, constraints: StoredConstraint[]): StoredConstraint | null {
  const pattern = new RegExp(`(^|[^A-Z0-9-])${workCentre.replace(/[-]/g, "\\-")}($|[^A-Z0-9-])`, "i");
  return constraints.find((c) => c.type === "CAPACITY" && c.location.id === locationId && pattern.test(c.name)) ?? null;
}

export interface WorkCentreLoad {
  workCentre: string;
  constraint: { id: string; name: string; unit: string; capacity: number } | null;
  /** Highest planned daily load across comparable orders, in the constraint's unit. */
  peak: { date: string; load: number; pct: number } | null;
  overloaded: boolean;
  /** Orders whose unit the constraint cannot be compared with. */
  notComparable: string[];
}

/**
 * Planned daily load per work centre against its capacity constraint, where
 * one exists, is per day, and shares the order's unit. An order's load is its
 * quantity spread evenly over its planned days; overlapping orders add up on
 * the days they share.
 */
export function capacityLoads(orders: ScheduleOrderInput[], bars: ScheduleBar[], constraints: StoredConstraint[]): WorkCentreLoad[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  return workCentres(bars).map((wc) => {
    const on = bars.filter((b) => b.workCentre === wc);
    const location = orderById.get(on[0].orderId)!.location.id;
    const c = constraintFor(wc, location, constraints);
    const cUnit = c ? unitOfConstraint(c.unit) : null;

    if (!c || c.capacity === null || !cUnit || !isPerDay(c.unit)) {
      return {
        workCentre: wc,
        constraint: null,
        peak: null,
        overloaded: false,
        notComparable: c ? on.map((b) => b.orderNumber) : [],
      };
    }

    const daily = new Map<string, number>();
    const notComparable: string[] = [];
    for (const b of on) {
      const o = orderById.get(b.orderId)!;
      if (o.uom !== cUnit || o.location.id !== c.location.id) {
        notComparable.push(b.orderNumber);
        continue;
      }
      const perDay = o.plannedQty / b.days;
      for (let i = 0; i < b.days; i++) {
        const d = addDaysIso(b.start, i);
        daily.set(d, (daily.get(d) ?? 0) + perDay);
      }
    }

    let peak: WorkCentreLoad["peak"] = null;
    for (const [date, load] of [...daily.entries()].sort()) {
      if (!peak || load > peak.load) peak = { date, load: Math.round(load * 1e6) / 1e6, pct: Math.round((load / c.capacity) * 1000) / 10 };
    }

    return {
      workCentre: wc,
      constraint: { id: c.id, name: c.name, unit: c.unit!, capacity: c.capacity },
      peak,
      overloaded: !!peak && peak.load > c.capacity,
      notComparable,
    };
  });
}

/* ---- Constraints panel -------------------------------------------------------------- */

export type Severity = "High" | "Medium" | "Low";

export interface ScheduleConstraint {
  kind: "STORED" | "SHORTAGE" | "OVERDUE" | "OVERLAP" | "CAPACITY_LOAD";
  title: string;
  severity: Severity;
  orderNumber?: string;
  stored?: StoredConstraint & { recordedPct: number | null };
  shortages?: NonNullable<ScheduleOrderInput["shortages"]>;
  /** Other open orders planned to make a short material before this order starts — not netted. */
  plannedSupply?: { orderNumber: string; materialCode: string; quantity: number; uom: string; plannedEnd: string }[];
  overdueDays?: number;
  overlap?: Overlap;
  load?: WorkCentreLoad;
}

/** Stored utilisation, as recorded: 100%+ High, 80%+ Medium, else Low. */
export function recordedSeverity(pct: number | null): Severity {
  if (pct === null) return "Low";
  return pct >= 100 ? "High" : pct >= 80 ? "Medium" : "Low";
}

export function buildConstraints(
  orders: ScheduleOrderInput[],
  stored: StoredConstraint[],
  overlaps: Overlap[],
  loads: WorkCentreLoad[],
  asOf: Date,
): ScheduleConstraint[] {
  const out: ScheduleConstraint[] = [];
  const today = startOfUtcDay(asOf).getTime();

  for (const o of orders) {
    if (o.shortages && o.shortages.length) {
      const supply = o.shortages.flatMap((s) =>
        orders
          .filter((p) =>
            p.id !== o.id && p.product.id === s.materialId && p.location.id === o.location.id &&
            // Still open (finished orders carry no shortages list) and due before this one starts.
            p.shortages !== null && p.plannedEndDate <= o.plannedStartDate)
          .map((p) => ({ orderNumber: p.orderNumber, materialCode: s.code, quantity: p.plannedQty, uom: p.uom, plannedEnd: p.plannedEndDate })));
      out.push({
        kind: "SHORTAGE", title: "Material shortage", severity: "High", orderNumber: o.orderNumber,
        shortages: o.shortages, ...(supply.length ? { plannedSupply: supply } : {}),
      });
    }
  }
  for (const o of orders.filter((x) => x.overdue)) {
    out.push({
      kind: "OVERDUE", title: "Overdue order", severity: "High", orderNumber: o.orderNumber,
      overdueDays: Math.round((today - day(o.plannedEndDate).getTime()) / DAY_MS),
    });
  }
  for (const l of loads.filter((x) => x.overloaded)) {
    out.push({ kind: "CAPACITY_LOAD", title: "Capacity overload", severity: "High", load: l });
  }
  for (const ov of overlaps) {
    out.push({ kind: "OVERLAP", title: "Work centre overlap", severity: "Medium", overlap: ov });
  }
  for (const c of stored) {
    const recordedPct = c.capacity ? Math.round((c.utilised / c.capacity) * 1000) / 10 : null;
    out.push({ kind: "STORED", title: c.name, severity: recordedSeverity(recordedPct), stored: { ...c, recordedPct } });
  }
  return out;
}

/* ---- Window ------------------------------------------------------------------------- */

export interface ScheduleWindow {
  start: string;
  days: number;
}

/**
 * The window that shows every bar: earliest start to latest end, at least
 * `minDays` wide and at most `maxDays` (beyond that, navigation pages it).
 */
export function fitWindow(bars: { start: string; end: string }[], minDays = 7, maxDays = 42): ScheduleWindow | null {
  if (!bars.length) return null;
  const start = bars.reduce((m, b) => (b.start < m ? b.start : m), bars[0].start);
  const end = bars.reduce((m, b) => (b.end > m ? b.end : m), bars[0].end);
  return { start, days: Math.min(maxDays, Math.max(minDays, spanDays(start, end))) };
}

/** A bar's position in a window, clipped: left and width as percentages, or null when outside. */
export function placeBar(bar: { start: string; end: string }, w: ScheduleWindow): { left: number; width: number } | null {
  const windowEnd = addDaysIso(w.start, w.days - 1);
  if (bar.end < w.start || bar.start > windowEnd) return null;
  const from = bar.start < w.start ? w.start : bar.start;
  const to = bar.end > windowEnd ? windowEnd : bar.end;
  const offset = spanDays(w.start, from) - 1;
  return { left: (offset / w.days) * 100, width: (spanDays(from, to) / w.days) * 100 };
}

/** Lane per bar so bars sharing a day on one row never draw over each other. */
export function assignLanes<T extends { start: string; end: string }>(bars: T[]): (T & { lane: number })[] {
  const laneEnds: string[] = [];
  return [...bars]
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .map((b) => {
      let lane = laneEnds.findIndex((end) => end < b.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = b.end;
      return { ...b, lane };
    });
}

/* ---- Response shape (shared with the client as types only) ------------------------------ */

export interface ScheduleOrder extends Omit<ScheduleOrderInput, "operations"> {
  workCentres: string[];
  setupMinutes: number;
  runMinutes: number;
}

export interface ScheduleView {
  asOf: string;
  orders: ScheduleOrder[];
  bars: ScheduleBar[];
  workCentres: string[];
  overlaps: Overlap[];
  loads: WorkCentreLoad[];
  constraints: ScheduleConstraint[];
}

export function buildSchedule(orders: ScheduleOrderInput[], stored: StoredConstraint[], asOf: Date): ScheduleView {
  const bars = buildBars(orders);
  const overlaps = findOverlaps(bars);
  const loads = capacityLoads(orders, bars, stored);
  return {
    asOf: asOf.toISOString(),
    orders: orders.map(({ operations, ...o }) => ({
      ...o,
      workCentres: workCentreRoute(operations),
      setupMinutes: operations.reduce((s, op) => s + op.setupMinutes, 0),
      runMinutes: operations.reduce((s, op) => s + op.runMinutes, 0),
    })),
    bars,
    workCentres: workCentres(bars),
    overlaps,
    loads,
    constraints: buildConstraints(orders, stored, overlaps, loads, asOf),
  };
}
