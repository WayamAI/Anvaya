import { Prisma } from "@prisma/client";
import { AppError, type ErrorDetail } from "@/server/errors/app-error";
import type { WorkOrderStatus } from "./work-orders";

/**
 * Work orders — the write rules, free of the database.
 *
 * Lifecycle:
 *
 *   PLANNED ─firm─▶ FIRMED ─release─▶ RELEASED ─issue / output─▶ IN_PROGRESS ─complete─▶ COMPLETED ─close─▶ CLOSED
 *      │              │                  │
 *      └──────────────┴──── cancel ──────┴──▶ CANCELLED   (only while nothing is issued or produced)
 *
 * PLANNED and FIRMED orders can be edited; editing the quantity re-takes the
 * component snapshot from the pinned BOM version. Release freezes the order
 * for the shop floor. The first issue or output moves it IN_PROGRESS.
 * Material that has been issued must be accounted for, so an order with
 * issues or output cannot be cancelled — it is completed short and closed.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);

type Transition = "edit" | "firm" | "release" | "issue" | "output" | "complete" | "close" | "cancel";

const ALLOWED: Record<Transition, readonly WorkOrderStatus[]> = {
  edit: ["PLANNED", "FIRMED"],
  firm: ["PLANNED"],
  release: ["PLANNED", "FIRMED"],
  issue: ["RELEASED", "IN_PROGRESS"],
  output: ["RELEASED", "IN_PROGRESS"],
  complete: ["IN_PROGRESS"],
  close: ["COMPLETED"],
  cancel: ["PLANNED", "FIRMED", "RELEASED"],
};

const VERB: Record<Transition, string> = {
  edit: "edited", firm: "firmed", release: "released", issue: "issued to", output: "reported against",
  complete: "completed", close: "closed", cancel: "cancelled",
};

export function assertWoTransition(status: WorkOrderStatus, action: Transition, orderNumber: string): void {
  if (!ALLOWED[action].includes(status)) {
    throw AppError.conflict(
      `${orderNumber} is ${status} and cannot be ${VERB[action]}; it must be ${ALLOWED[action].join(" or ")}`,
      { status, action },
    );
  }
}

/* ---- Component snapshot -------------------------------------------------- */

export interface BomLine {
  materialId: string;
  materialCode: string;
  /** Unit the BOM line is quoted in. */
  unitOfMeasureId: string;
  /** The material's stocking unit. */
  stockUnitOfMeasureId: string;
  quantity: Prisma.Decimal;
  scrapFactor: Prisma.Decimal;
  leadTimeOffsetDays: number;
  isOptional: boolean;
}

export interface SnapshotLine {
  materialId: string;
  requiredQty: Prisma.Decimal;
  leadTimeOffsetDays: number;
}

/**
 * Component requirements for an order quantity, as the seed and the BOM
 * screen compute them: qty ÷ base × order qty × (1 + scrap), to 6 places.
 *
 * The schema holds no unit conversions, so a BOM line quoted in a unit other
 * than the material's stocking unit cannot be turned into a stock quantity
 * honestly; it is refused rather than guessed. Optional lines are left out
 * (they are substitutes, issued only when chosen). A material listed on
 * several lines is summed into one requirement, matching the one-row-per-
 * material component table.
 */
export function snapshotComponents(lines: BomLine[], baseQuantity: Prisma.Decimal, orderQty: Prisma.Decimal): SnapshotLine[] {
  if (baseQuantity.lte(0)) throw AppError.unprocessable("The BOM version has a base quantity of zero");
  const problems: ErrorDetail[] = lines
    .filter((l) => !l.isOptional && l.unitOfMeasureId !== l.stockUnitOfMeasureId)
    .map((l) => ({
      path: "bom",
      message: `${l.materialCode} is quoted in a different unit from the one it is stocked in; no conversion is defined`,
    }));
  if (problems.length) throw AppError.unprocessable("The BOM cannot be converted into stock quantities", problems);

  const byMaterial = new Map<string, SnapshotLine>();
  for (const l of lines) {
    if (l.isOptional) continue;
    const required = l.quantity.div(baseQuantity).times(orderQty).times(D(1).plus(l.scrapFactor)).toDecimalPlaces(6, Prisma.Decimal.ROUND_UP);
    const prev = byMaterial.get(l.materialId);
    byMaterial.set(l.materialId, {
      materialId: l.materialId,
      requiredQty: prev ? prev.requiredQty.plus(required) : required,
      leadTimeOffsetDays: Math.max(prev?.leadTimeOffsetDays ?? 0, l.leadTimeOffsetDays),
    });
  }
  return [...byMaterial.values()];
}

/* ---- Issues -------------------------------------------------------------- */

export interface IssuableComponent {
  id: string;
  materialId: string;
  materialCode: string;
  requiredQty: Prisma.Decimal;
  issuedQty: Prisma.Decimal;
}

export interface IssueLineInput {
  materialId: string;
  quantity: number;
  lots?: { lotId: string; quantity: number }[];
}

export interface PlannedIssue {
  component: IssuableComponent;
  quantity: Prisma.Decimal;
  issuedAfter: Prisma.Decimal;
  input: IssueLineInput;
}

/**
 * Check an issue against the order's components: each is one of them,
 * appears once, and brings the issued total to no more than required plus
 * the tolerance (extra scrap happens; unlimited over-issue is a leak).
 */
export function planIssue(components: IssuableComponent[], input: IssueLineInput[], tolerancePct: number): PlannedIssue[] {
  const byMaterial = new Map(components.map((c) => [c.materialId, c]));
  const seen = new Set<string>();
  const problems: ErrorDetail[] = [];
  const planned: PlannedIssue[] = [];

  input.forEach((l, i) => {
    const c = byMaterial.get(l.materialId);
    if (!c) return void problems.push({ path: `lines.${i}.materialId`, message: "is not a component of this work order" });
    if (seen.has(c.materialId)) return void problems.push({ path: `lines.${i}.materialId`, message: `${c.materialCode} appears more than once` });
    seen.add(c.materialId);

    const qty = D(l.quantity).toDecimalPlaces(6);
    const ceiling = c.requiredQty.times(D(1).plus(D(tolerancePct).div(100)));
    if (c.issuedQty.plus(qty).gt(ceiling)) {
      const room = Prisma.Decimal.max(ZERO, ceiling.minus(c.issuedQty));
      return void problems.push({
        path: `lines.${i}.quantity`,
        message: `${c.materialCode}: issuing ${qty} would exceed the requirement of ${c.requiredQty}${tolerancePct ? ` plus ${tolerancePct}%` : ""}; at most ${room} more`,
      });
    }
    if (l.lots?.length) {
      const sum = l.lots.reduce((s, x) => s.plus(x.quantity), ZERO);
      if (!sum.equals(qty)) return void problems.push({ path: `lines.${i}.lots`, message: `lot quantities add up to ${sum}, not ${qty}` });
    }
    planned.push({ component: c, quantity: qty, issuedAfter: c.issuedQty.plus(qty), input: l });
  });

  if (problems.length) throw AppError.unprocessable("The issue cannot be posted", problems);
  return planned;
}

/* ---- Output and costing ------------------------------------------------- */

/** Produced quantity may exceed the plan only by the tolerance. */
export function assertOutputWithinPlan(plannedQty: Prisma.Decimal, producedAfter: Prisma.Decimal, tolerancePct: number, orderNumber: string) {
  const ceiling = plannedQty.times(D(1).plus(D(tolerancePct).div(100)));
  if (producedAfter.gt(ceiling)) {
    throw AppError.unprocessable(
      `${orderNumber}: output would reach ${producedAfter}, more than the planned ${plannedQty} plus ${tolerancePct}%`,
      [{ path: "quantity", message: `total output is capped at ${ceiling.toDecimalPlaces(6)}` }],
    );
  }
}

/**
 * Actual materials cost per unit of this output.
 *
 * The order carries the value of everything issued to it; outputs draw that
 * value down. A partial output takes its proportional share of what is not
 * yet capitalised, spread over the quantity still to make; the completing
 * output takes all of the remainder, so after completion the order holds no
 * value and the finished stock carries exactly what was consumed. With
 * nothing issued (nothing to cost from), the product's standard cost is
 * used instead of valuing new stock at zero.
 */
export function outputUnitCost(opts: {
  issuedValue: Prisma.Decimal;
  capitalisedValue: Prisma.Decimal;
  quantity: Prisma.Decimal;
  remainingToMake: Prisma.Decimal;
  completing: boolean;
  standardCost: Prisma.Decimal | null;
}): Prisma.Decimal {
  const open = Prisma.Decimal.max(ZERO, opts.issuedValue.minus(opts.capitalisedValue));
  if (opts.issuedValue.lte(0)) return (opts.standardCost ?? ZERO).toDecimalPlaces(4);
  const share = opts.completing
    ? open
    : open.times(Prisma.Decimal.min(D(1), opts.quantity.div(Prisma.Decimal.max(opts.quantity, opts.remainingToMake))));
  return share.div(opts.quantity).toDecimalPlaces(4);
}
