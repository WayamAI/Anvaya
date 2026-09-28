import { randomUUID } from "node:crypto";
import { chooseVendor, leadTime } from "@/server/inventory/exhaustion";
import { addDays, daysBetween, r6 } from "./dates";
import type { DemandEvent } from "./demand";
import { sizeLot, type LotSizing } from "./lot-sizing";

/**
 * The MRP engine — material requirements planning as a pure function.
 *
 * Input is a snapshot (stock, open orders, demand, BOMs, policies, vendors);
 * output is the plan (time-phased requirements, planned orders with pegging
 * and explanations, exceptions). No database access, no clock: the same
 * snapshot always produces the same plan, which is what makes it testable
 * and a run reproducible.
 *
 * The method, per material and location, in low-level-code order:
 *
 *   1. Low-level codes. Each material is planned at its deepest BOM level, so
 *      every parent that consumes it has already been planned and exploded
 *      before it is netted. A material in a BOM cycle is reported, not
 *      exploded.
 *   2. Gross requirements: sales orders and consumed forecast (independent),
 *      open work orders' unissued components, and components of planned
 *      production orders (dependent). Demand dated before the planning date
 *      is past due and needed now.
 *   3. Netting. Demand joins a first-in-first-out queue. Supply consumes it in
 *      date order: stock above safety stock first, then scheduled receipts
 *      (open POs and work orders) as they arrive. A shortfall below safety
 *      stock enters the queue as demand of its own, so it is netted, pegged
 *      and explained like any other. What the queue still holds in a bucket
 *      is that bucket's net requirement.
 *   4. Lot sizing turns the net requirement into order quantities (policy
 *      rule, minimum, multiple, maximum; a vendor's MOQ and multiple for
 *      purchases). What a planned order supplies beyond the demand it covers
 *      is carried forward as stock.
 *   5. Lead-time offset: release = required date − lead time (production lead
 *      time, or the chosen vendor's, plus safety lead time — the same rule
 *      as the exhaustion alerts).
 *   6. Pegging: each planned order records which demands it satisfies — the
 *      sales order line, forecast period, parent planned order or safety
 *      stock — quantity by quantity.
 *   7. Exceptions: past-due releases, stock-outs inside the lead time, late
 *      and overdue receipts, missing BOMs, vendors and manufacturing
 *      locations, BOM cycles and stock with no demand.
 *
 * Only plants make things: a MAKE item short at a location with no
 * manufacturing is reported rather than planned there, since the schema has
 * no transfer orders to move it from the plant.
 */

export interface EngineItem {
  id: string;
  code: string;
  uom: string;
}

export interface EnginePolicy {
  materialId: string;
  locationId: string;
  procurementType: "BUY" | "MAKE";
  safetyStock: number;
  lotSizing: LotSizing;
  periodDays: number | null;
  productionLeadTimeDays: number;
  safetyLeadTimeDays: number;
}

export interface EngineBom {
  materialId: string;
  versionId: string;
  baseQuantity: number;
  components: {
    materialId: string;
    quantity: number;
    scrapFactor: number;
    leadTimeOffsetDays: number;
    isOptional: boolean;
    /** False when the BOM line is quoted in a unit the component is not stocked in. */
    unitMatches: boolean;
  }[];
}

export interface EngineVendor {
  vendorId: string;
  code: string;
  name: string;
  leadTimeDays: number;
  isPreferred: boolean;
  minOrderQty: number;
  orderMultiple: number;
}

export interface ScheduledReceipt {
  materialId: string;
  locationId: string;
  /** ISO date the quantity is expected. */
  date: string;
  qty: number;
  type: "PURCHASE_ORDER" | "WORK_ORDER";
  id: string;
  reference: string;
}

export interface EngineInput {
  asOf: string;
  horizonDays: number;
  bucketSizeDays: number;
  respectSafetyStock: boolean;
  items: EngineItem[];
  policies: EnginePolicy[];
  boms: EngineBom[];
  vendors: { materialId: string; options: EngineVendor[] }[];
  onHand: { materialId: string; locationId: string; qty: number }[];
  demand: DemandEvent[];
  receipts: ScheduledReceipt[];
  manufacturingLocationIds: string[];
  /** Id generator for planned orders; injectable so tests are deterministic. */
  newId?: () => string;
}

export interface Peg {
  demandSourceType: DemandEvent["sourceType"];
  demandSourceId: string | null;
  demandReference: string;
  quantity: number;
  requiredDate: string;
  parentPlannedOrderId: string | null;
}

export interface ExplanationStep {
  label: string;
  value: number | string;
  detail?: string;
}

export interface PlannedOrderOut {
  id: string;
  materialId: string;
  locationId: string;
  type: "PURCHASE" | "PRODUCTION";
  quantity: number;
  releaseDate: string;
  requiredDate: string;
  leadTimeDays: number;
  leadTimeSource: string | null;
  suggestedVendorId: string | null;
  lowLevelCode: number;
  pegs: Peg[];
  explanation: { steps: ExplanationStep[]; summary: string };
}

export interface RequirementRow {
  materialId: string;
  locationId: string;
  lowLevelCode: number;
  bucketStart: string;
  bucketEnd: string;
  grossRequirement: number;
  scheduledReceipts: number;
  projectedOnHand: number;
  safetyStock: number;
  netRequirement: number;
  plannedReceipt: number;
  plannedRelease: number;
}

export type ExceptionType =
  | "MATERIAL_SHORTAGE" | "LATE_SUPPLY" | "PAST_DUE_RELEASE" | "MISSING_BOM"
  | "MISSING_VENDOR" | "MISSING_LEAD_TIME" | "EXCESS_STOCK" | "BOM_CYCLE";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ExceptionOut {
  materialId: string | null;
  locationId: string | null;
  type: ExceptionType;
  severity: Severity;
  message: string;
  suggestedAction: string | null;
  quantity: number | null;
  dueDate: string | null;
  daysLate: number | null;
  referenceType: string | null;
  referenceId: string | null;
}

export interface EngineOutput {
  lowLevelCodes: Record<string, number>;
  requirements: RequirementRow[];
  plannedOrders: PlannedOrderOut[];
  exceptions: ExceptionOut[];
  materialsPlanned: number;
}

const key = (m: string, l: string) => `${m}|${l}`;
const SOURCE_ORDER: Record<DemandEvent["sourceType"], number> = {
  SAFETY_STOCK: 0, SALES_ORDER: 1, WORK_ORDER: 2, DEPENDENT: 3, FORECAST: 4,
};

/* ---- Low-level codes ------------------------------------------------------ */

/**
 * The deepest level at which each material appears under any product, and
 * the materials caught in a BOM cycle (whose explosion would never end).
 */
export function lowLevelCodes(boms: EngineBom[]): { codes: Map<string, number>; cyclic: Set<string> } {
  const children = new Map(boms.map((b) => [b.materialId, b.components.map((c) => c.materialId)]));
  const cyclic = new Set<string>();
  const state = new Map<string, 1 | 2>(); // 1 visiting, 2 done

  function findCycles(node: string, stack: string[]) {
    state.set(node, 1);
    for (const c of children.get(node) ?? []) {
      if (state.get(c) === 1) stack.slice(stack.indexOf(c)).concat(node).forEach((n) => cyclic.add(n));
      else if (!state.get(c)) findCycles(c, [...stack, node]);
    }
    state.set(node, 2);
  }
  for (const m of children.keys()) if (!state.get(m)) findCycles(m, []);

  const codes = new Map<string, number>();
  const visit = (node: string, level: number) => {
    if ((codes.get(node) ?? -1) >= level) return;
    codes.set(node, level);
    if (cyclic.has(node)) return;
    for (const c of children.get(node) ?? []) if (!cyclic.has(c)) visit(c, level + 1);
  };
  const allChildren = new Set([...children.values()].flat());
  for (const m of children.keys()) if (!allChildren.has(m)) visit(m, 0);
  // Anything unreached (only in cycles, or a stray component) starts at 0.
  for (const m of [...children.keys(), ...allChildren]) if (!codes.has(m)) visit(m, 0);
  return { codes, cyclic };
}

/* ---- Engine --------------------------------------------------------------- */

interface QueueEntry {
  event: DemandEvent;
  remaining: number;
}

export function runMrp(input: EngineInput): EngineOutput {
  const newId = input.newId ?? randomUUID;
  const { asOf, bucketSizeDays: size } = input;
  const horizonEnd = addDays(asOf, input.horizonDays);

  const items = new Map(input.items.map((i) => [i.id, i]));
  const policies = new Map(input.policies.map((p) => [key(p.materialId, p.locationId), p]));
  const bomsByMaterial = new Map(input.boms.map((b) => [b.materialId, b]));
  const vendors = new Map(input.vendors.map((v) => [v.materialId, v.options]));
  const onHand = new Map(input.onHand.map((o) => [key(o.materialId, o.locationId), o.qty]));
  const manufacturing = new Set(input.manufacturingLocationIds);
  const { codes: llc, cyclic } = lowLevelCodes(input.boms);

  const demandByKey = new Map<string, DemandEvent[]>();
  const addDemand = (e: DemandEvent) => {
    if (e.date > horizonEnd || e.qty <= 0) return;
    const k = key(e.materialId, e.locationId);
    (demandByKey.get(k) ?? demandByKey.set(k, []).get(k)!).push(e);
  };
  input.demand.forEach(addDemand);

  const receiptsByKey = new Map<string, ScheduledReceipt[]>();
  for (const r of input.receipts) {
    if (r.date > horizonEnd || r.qty <= 0) continue;
    const k = key(r.materialId, r.locationId);
    (receiptsByKey.get(k) ?? receiptsByKey.set(k, []).get(k)!).push(r);
  }

  const exceptions: ExceptionOut[] = [];
  const plannedOrders: PlannedOrderOut[] = [];
  const requirements: RequirementRow[] = [];
  const planned = new Set<string>();

  const item = (m: string) => items.get(m) ?? { id: m, code: m, uom: "" };
  const levelOf = (m: string) => llc.get(m) ?? 0;
  const bucketOf = (d: string) => (d <= asOf ? 0 : Math.floor(daysBetween(asOf, d) / size));
  const bucketStart = (b: number) => addDays(asOf, b * size);
  const exception = (e: Omit<ExceptionOut, "suggestedAction" | "quantity" | "dueDate" | "daysLate" | "referenceType" | "referenceId"> & Partial<ExceptionOut>) =>
    exceptions.push({ suggestedAction: null, quantity: null, dueDate: null, daysLate: null, referenceType: null, referenceId: null, ...e });

  for (const m of cyclic) {
    exception({
      materialId: m, locationId: null, type: "BOM_CYCLE", severity: "CRITICAL",
      message: `${item(m).code} is part of a BOM cycle; its structure is not exploded`,
      suggestedAction: "Correct the BOM so no product contains itself",
    });
  }

  // Plan every material-location with a policy, demand or supply, level by
  // level. Explosion adds demand to deeper levels as it goes.
  const pending = () => new Set([...policies.keys(), ...demandByKey.keys(), ...receiptsByKey.keys()].filter((k) => !planned.has(k)));
  for (let level = 0; ; level++) {
    const keys = [...pending()].filter((k) => levelOf(k.split("|")[0]) <= level).sort();
    if (!keys.length) {
      if (![...pending()].length) break;
      continue;
    }
    for (const k of keys) planOne(k);
    if (level > 1000) throw new Error("MRP did not converge; check the BOM structure");
  }

  function planOne(k: string) {
    planned.add(k);
    const [materialId, locationId] = k.split("|");
    const it = item(materialId);
    const policy = policies.get(k);
    const bom = bomsByMaterial.get(materialId);
    const makes = policy ? policy.procurementType === "MAKE" : !!bom;
    const ss = input.respectSafetyStock ? policy?.safetyStock ?? 0 : 0;
    const stock = onHand.get(k) ?? 0;
    const demands = (demandByKey.get(k) ?? []).slice().sort((a, b) =>
      a.date.localeCompare(b.date) || SOURCE_ORDER[a.sourceType] - SOURCE_ORDER[b.sourceType]);
    const receipts = (receiptsByKey.get(k) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
    const level = levelOf(materialId);

    // Where supply comes from, and how long it takes.
    const canMake = manufacturing.has(locationId);
    const vendor = makes ? null : chooseVendor(vendors.get(materialId) ?? []) as EngineVendor | null;
    const lt = leadTime({
      procurementType: makes ? "MAKE" : "BUY",
      productionLeadTimeDays: policy?.productionLeadTimeDays ?? 0,
      safetyLeadTimeDays: policy?.safetyLeadTimeDays ?? 0,
      vendorLeadTimeDays: vendor ? vendor.leadTimeDays : null,
    });
    const leadDays = lt.days ?? policy?.safetyLeadTimeDays ?? 0;
    const leadSource = makes ? "PRODUCTION" : vendor ? `VENDOR:${vendor.code}` : null;
    const lotSizing: LotSizing = {
      rule: policy?.lotSizing.rule ?? "LOT_FOR_LOT",
      minOrderQty: Math.max(policy?.lotSizing.minOrderQty ?? 0, vendor?.minOrderQty ?? 0),
      orderMultiple: policy?.lotSizing.orderMultiple || vendor?.orderMultiple || 0,
      maxOrderQty: policy?.lotSizing.maxOrderQty ?? null,
    };

    // Overdue receipts count as arriving now, and are reported.
    for (const r of receipts.filter((x) => x.date < asOf)) {
      exception({
        materialId, locationId, type: "LATE_SUPPLY", severity: "HIGH",
        message: `${r.reference}: ${r.qty} ${it.uom} of ${it.code} was due ${r.date} and has not arrived`,
        suggestedAction: r.type === "PURCHASE_ORDER" ? "Chase the vendor for a firm delivery date" : "Complete or reschedule the work order",
        quantity: r.qty, dueDate: r.date, daysLate: daysBetween(r.date, asOf), referenceType: r.type, referenceId: r.id,
      });
    }

    // Queue and pool: demand waiting for supply, and supply waiting for demand.
    const queue: QueueEntry[] = [];
    let pool = stock - ss;
    if (pool < 0) {
      queue.push({
        event: { materialId, locationId, date: asOf, qty: r6(-pool), sourceType: "SAFETY_STOCK", sourceId: null, reference: `Safety stock ${ss} ${it.uom}` },
        remaining: r6(-pool),
      });
      pool = 0;
    }
    const consume = (supply: number, onPeg?: (e: QueueEntry, q: number) => void) => {
      let left = supply;
      while (left > 1e-9 && queue.length) {
        const head = queue[0];
        const take = Math.min(left, head.remaining);
        head.remaining = r6(head.remaining - take);
        left = r6(left - take);
        onPeg?.(head, r6(take));
        if (head.remaining <= 1e-9) queue.shift();
      }
      return left;
    };

    const buckets = [...new Set([0, ...demands.map((d) => bucketOf(d.date)), ...receipts.map((r) => bucketOf(r.date))])].sort((a, b) => a - b);
    let projected = stock;
    let receivedSoFar = 0;
    let reportedUnplannable = false;
    let reportedNoVendor = false;
    let reportedNoBom = false;
    const releasesByBucket = new Map<number, number>();
    const rows: RequirementRow[] = [];

    for (const b of buckets) {
      const bd = demands.filter((d) => bucketOf(d.date) === b);
      const br = receipts.filter((r) => bucketOf(r.date) === b);
      const gross = r6(bd.reduce((s, d) => s + d.qty, 0));
      const sched = r6(br.reduce((s, r) => s + r.qty, 0));
      receivedSoFar = r6(receivedSoFar + sched);

      pool = r6(pool + sched);
      for (const d of bd) queue.push({ event: d, remaining: d.qty });
      pool = consume(pool);

      const unmet = r6(queue.reduce((s, e) => s + e.remaining, 0));
      let plannedQty = 0;

      if (unmet > 0) {
        if (makes && !canMake) {
          if (!reportedUnplannable) {
            reportedUnplannable = true;
            exception({
              materialId, locationId, type: "MATERIAL_SHORTAGE", severity: "HIGH",
              message: `${it.code} is short ${unmet} ${it.uom} at a location that does not manufacture; nothing can be planned there`,
              suggestedAction: "Transfer stock from the plant, or buy it in",
              quantity: unmet, dueDate: queue[0].event.date < asOf ? asOf : queue[0].event.date,
            });
          }
        } else {
          const requiredDate = queue[0].event.date < asOf ? asOf : queue[0].event.date;
          let toCover = unmet;
          // Period order quantity: cover the whole period's net demand now.
          if (lotSizing.rule === "PERIOD_ORDER_QTY" && policy?.periodDays) {
            const windowEnd = addDays(requiredDate, policy.periodDays - 1);
            const later = demands.filter((d) => bucketOf(d.date) > b && d.date <= windowEnd).reduce((s, d) => s + d.qty, 0);
            const laterIn = receipts.filter((r) => bucketOf(r.date) > b && r.date <= windowEnd).reduce((s, r) => s + r.qty, 0);
            toCover = r6(unmet + Math.max(0, later - laterIn));
          }
          const quantities = sizeLot(toCover, lotSizing);
          const releaseDate = addDays(requiredDate, -leadDays);

          if (!makes && !vendor && !reportedNoVendor) {
            reportedNoVendor = true;
            const options = vendors.get(materialId) ?? [];
            exception({
              materialId, locationId, type: "MISSING_VENDOR", severity: "HIGH",
              message: options.length
                ? `${it.code} has ${options.length} vendors and none preferred; the lead time is unknown`
                : `${it.code} has no vendor on file; the lead time is unknown`,
              suggestedAction: options.length ? "Mark one vendor as preferred" : "Add a vendor for the material",
            });
          }
          if (makes && !bom && !reportedNoBom) {
            reportedNoBom = true;
            exception({
              materialId, locationId, type: "MISSING_BOM", severity: "HIGH",
              message: `${it.code} is made in-house but has no active BOM; its components are not planned`,
              suggestedAction: "Create and activate a BOM version",
            });
          }

          for (const q of quantities) {
            const id = newId();
            const pegs: Peg[] = [];
            const excess = consume(q, (e, taken) => pegs.push({
              demandSourceType: e.event.sourceType, demandSourceId: e.event.sourceId, demandReference: e.event.reference,
              quantity: taken, requiredDate: e.event.date < asOf ? asOf : e.event.date,
              parentPlannedOrderId: e.event.parentPlannedOrderId ?? null,
            }));
            pool = r6(pool + excess);
            plannedQty = r6(plannedQty + q);
            const releaseBucket = bucketOf(releaseDate);
            releasesByBucket.set(releaseBucket, r6((releasesByBucket.get(releaseBucket) ?? 0) + q));

            const steps: ExplanationStep[] = [
              { label: "Gross requirement this bucket", value: gross, detail: bd.map((d) => d.reference).join(", ") || undefined },
              { label: "On hand at plan start", value: stock },
              { label: "Scheduled receipts to date", value: receivedSoFar },
              { label: "Safety stock held", value: ss },
              { label: "Net requirement", value: unmet },
              { label: `Lot sizing (${lotSizing.rule.replace(/_/g, " ").toLowerCase()})`, value: q,
                detail: `min ${lotSizing.minOrderQty}, multiple ${lotSizing.orderMultiple}${lotSizing.maxOrderQty ? `, max ${lotSizing.maxOrderQty}` : ""}` },
              { label: "Lead time (days)", value: leadDays, detail: leadSource ?? "no vendor chosen: safety lead time only" },
              { label: "Release date", value: releaseDate },
            ];
            const covers = pegs.map((p) => p.demandReference);
            plannedOrders.push({
              id, materialId, locationId, type: makes ? "PRODUCTION" : "PURCHASE", quantity: q,
              releaseDate, requiredDate, leadTimeDays: leadDays, leadTimeSource: leadSource,
              suggestedVendorId: vendor?.vendorId ?? null, lowLevelCode: level, pegs,
              explanation: {
                steps,
                summary: `${makes ? "Make" : "Buy"} ${q} ${it.uom} ${it.code}, release ${releaseDate}, for ${requiredDate}` +
                  (covers.length ? ` — covers ${[...new Set(covers)].slice(0, 3).join(", ")}${new Set(covers).size > 3 ? "…" : ""}` : ""),
              },
            });

            if (releaseDate < asOf) {
              const late = daysBetween(releaseDate, asOf);
              exception({
                materialId, locationId, type: "PAST_DUE_RELEASE", severity: requiredDate <= asOf ? "CRITICAL" : "HIGH",
                message: `${it.code}: ${q} ${it.uom} for ${requiredDate} should have been ${makes ? "released to production" : "ordered"} ${late} day(s) ago`,
                suggestedAction: makes ? "Release production now and expedite" : "Place the purchase order now and expedite with the vendor",
                quantity: q, dueDate: requiredDate, daysLate: late, referenceType: "PLANNED_ORDER", referenceId: id,
              });
            }

            // Explode a production order into its components' demand.
            if (makes && bom && !cyclic.has(materialId)) {
              for (const c of bom.components) {
                if (c.isOptional) continue;
                if (!c.unitMatches) {
                  exception({
                    materialId, locationId, type: "MISSING_BOM", severity: "HIGH",
                    message: `${it.code}: a line for ${item(c.materialId).code} is quoted in a unit with no conversion; it is not exploded`,
                    suggestedAction: "Quote the BOM line in the component's stocking unit",
                  });
                  continue;
                }
                const qty = r6((c.quantity / bom.baseQuantity) * q * (1 + c.scrapFactor));
                addDemand({
                  materialId: c.materialId, locationId, date: addDays(releaseDate, -c.leadTimeOffsetDays), qty,
                  sourceType: "DEPENDENT", sourceId: id, reference: `Planned ${it.code} ×${q}`, parentPlannedOrderId: id,
                });
              }
            }
          }
        }
      }

      projected = r6(projected + sched - gross + plannedQty);
      rows.push({
        materialId, locationId, lowLevelCode: level,
        bucketStart: bucketStart(b), bucketEnd: addDays(bucketStart(b), size - 1),
        grossRequirement: gross, scheduledReceipts: sched, projectedOnHand: projected, safetyStock: ss,
        netRequirement: unmet, plannedReceipt: plannedQty, plannedRelease: 0,
      });
    }

    // Releases land in the bucket of their release date (past ones, now).
    for (const [rb, qty] of releasesByBucket) {
      const row = rows.find((r) => r.bucketStart === bucketStart(rb));
      if (row) row.plannedRelease = r6(row.plannedRelease + qty);
      else {
        rows.push({
          materialId, locationId, lowLevelCode: level, bucketStart: bucketStart(rb), bucketEnd: addDays(bucketStart(rb), size - 1),
          grossRequirement: 0, scheduledReceipts: 0, projectedOnHand: NaN, safetyStock: ss,
          netRequirement: 0, plannedReceipt: 0, plannedRelease: qty,
        });
      }
    }
    rows.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
    // A row that exists only for a release carries the balance of the bucket before it.
    let last = stock;
    for (const r of rows) {
      if (Number.isNaN(r.projectedOnHand)) r.projectedOnHand = last;
      last = r.projectedOnHand;
    }
    requirements.push(...rows);

    shortageAndLateness(materialId, locationId, stock, demands, receipts, leadDays);

    const totalGross = demands.reduce((s, d) => s + d.qty, 0);
    if (policy && totalGross === 0 && stock > ss && stock > 0) {
      exception({
        materialId, locationId, type: "EXCESS_STOCK", severity: "LOW",
        message: `${it.code}: ${r6(stock - ss)} ${it.uom} above safety stock with no demand in the next ${input.horizonDays} days`,
        suggestedAction: "Review the safety stock or use the stock elsewhere",
        quantity: r6(stock - ss),
      });
    }
  }

  /**
   * Stock-outs a new order cannot prevent, and receipts arriving after the
   * stock has run out. Walked without planned orders or safety stock: this is
   * what happens to physical stock if nobody acts.
   */
  function shortageAndLateness(
    materialId: string, locationId: string, stock: number, demands: DemandEvent[], receipts: ScheduledReceipt[], leadDays: number,
  ) {
    const it = item(materialId);
    const events = [
      ...demands.map((d) => ({ date: d.date < asOf ? asOf : d.date, qty: -d.qty, receipt: null as ScheduledReceipt | null })),
      ...receipts.map((r) => ({ date: r.date < asOf ? asOf : r.date, qty: r.qty, receipt: r })),
    ].sort((a, b) => a.date.localeCompare(b.date) || b.qty - a.qty);

    const reachable = addDays(asOf, leadDays);
    let balance = stock;
    let stockOutDate: string | null = null;
    let worstBeforeLead = 0;
    let worstDate: string | null = null;
    for (const e of events) {
      if (e.receipt && stockOutDate && balance < 0 && e.date > stockOutDate) {
        exception({
          materialId, locationId, type: "LATE_SUPPLY", severity: "MEDIUM",
          message: `${e.receipt.reference} arrives ${e.date}, ${daysBetween(stockOutDate, e.date)} day(s) after ${it.code} runs out`,
          suggestedAction: `Expedite by ${daysBetween(stockOutDate, e.date)} day(s)`,
          quantity: e.receipt.qty, dueDate: stockOutDate, daysLate: daysBetween(stockOutDate, e.date),
          referenceType: e.receipt.type, referenceId: e.receipt.id,
        });
      }
      balance = r6(balance + e.qty);
      if (balance < 0 && !stockOutDate) stockOutDate = e.date;
      if (balance >= 0) stockOutDate = null;
      if (balance < worstBeforeLead && e.date < reachable) {
        worstBeforeLead = balance;
        worstDate = worstDate ?? e.date;
      }
    }
    if (worstBeforeLead < 0) {
      exception({
        materialId, locationId, type: "MATERIAL_SHORTAGE", severity: "CRITICAL",
        message: `${it.code} runs short by ${r6(-worstBeforeLead)} ${it.uom} from ${worstDate}, before a new order could arrive (lead time ${leadDays} day(s))`,
        suggestedAction: "Expedite open supply, reallocate stock or reschedule the demand",
        quantity: r6(-worstBeforeLead), dueDate: worstDate,
      });
    }
  }

  return {
    lowLevelCodes: Object.fromEntries(llc),
    requirements,
    plannedOrders,
    exceptions,
    materialsPlanned: planned.size,
  };
}
