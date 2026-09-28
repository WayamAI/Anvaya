import { addDays, daysBetween, maxDate, r6 } from "./dates";

/**
 * Independent demand for MRP: open sales order lines and forecast.
 *
 * Forecast consumption. A forecast period says how much is expected to sell;
 * sales orders booked for the same material, location and period are part
 * of that expectation, not in addition to it. So each period contributes the
 * forecast not yet consumed by orders — max(0, forecast − orders) — and the
 * orders contribute themselves. Demand is the larger of the two, never the
 * sum (the rule `ForecastPeriod.consumedQty` documents).
 *
 * A period already under way counts only its remaining days, pro rata: the
 * part of March before the planning date is history, not future demand.
 */

export interface SalesDemandLine {
  id: string;
  reference: string;
  materialId: string;
  locationId: string;
  /** ISO date. */
  requiredDate: string;
  openQty: number;
}

export interface ForecastPeriodInput {
  id: string;
  forecastName: string;
  materialId: string;
  locationId: string;
  periodStart: string;
  periodEnd: string;
  forecastQty: number;
}

export interface DemandEvent {
  materialId: string;
  locationId: string;
  /** ISO date the quantity is needed. */
  date: string;
  qty: number;
  sourceType: "SALES_ORDER" | "FORECAST" | "WORK_ORDER" | "DEPENDENT" | "SAFETY_STOCK";
  sourceId: string | null;
  reference: string;
  /** For DEPENDENT demand: the planned order that exploded into it. */
  parentPlannedOrderId?: string;
}

export interface ForecastUse {
  periodId: string;
  forecastQty: number;
  consumedBySales: number;
  /** Forecast that becomes demand after consumption and pro-rating. */
  netForecast: number;
}

export function independentDemand(
  sales: SalesDemandLine[],
  forecasts: ForecastPeriodInput[],
  asOf: string,
  horizonEnd: string,
  includeForecast: boolean,
): { events: DemandEvent[]; forecastUse: ForecastUse[] } {
  const events: DemandEvent[] = sales
    .filter((s) => s.openQty > 0 && s.requiredDate <= horizonEnd)
    .map((s) => ({
      materialId: s.materialId, locationId: s.locationId, date: s.requiredDate, qty: r6(s.openQty),
      sourceType: "SALES_ORDER", sourceId: s.id, reference: s.reference,
    }));

  const forecastUse: ForecastUse[] = [];
  if (!includeForecast) return { events, forecastUse };

  for (const p of forecasts) {
    if (p.periodEnd < asOf || p.periodStart > horizonEnd) continue;
    const ordered = sales
      .filter((s) => s.materialId === p.materialId && s.locationId === p.locationId && s.requiredDate >= p.periodStart && s.requiredDate <= p.periodEnd)
      .reduce((sum, s) => sum + s.openQty, 0);
    const unconsumed = Math.max(0, p.forecastQty - ordered);

    // Only the part of the period still ahead of the planning date, and
    // inside the horizon, is future demand.
    const periodDays = daysBetween(p.periodStart, p.periodEnd) + 1;
    const from = maxDate(p.periodStart, asOf);
    const to = p.periodEnd < horizonEnd ? p.periodEnd : horizonEnd;
    const remainingDays = Math.max(0, daysBetween(from, to) + 1);
    const netForecast = r6(unconsumed * (remainingDays / periodDays));

    forecastUse.push({ periodId: p.id, forecastQty: p.forecastQty, consumedBySales: r6(Math.min(ordered, p.forecastQty)), netForecast });
    if (netForecast <= 0) continue;

    // Spread evenly over the remaining weeks, so a monthly forecast does not
    // arrive as one lump on the 1st and inflate the first order.
    const chunks = Math.max(1, Math.ceil(remainingDays / 7));
    for (let i = 0; i < chunks; i++) {
      const date = addDays(from, i * 7);
      const qty = i === chunks - 1 ? r6(netForecast - r6(netForecast / chunks) * (chunks - 1)) : r6(netForecast / chunks);
      if (qty > 0) {
        events.push({
          materialId: p.materialId, locationId: p.locationId, date, qty,
          sourceType: "FORECAST", sourceId: p.id, reference: `${p.forecastName} (${p.periodStart.slice(0, 7)})`,
        });
      }
    }
  }
  return { events, forecastUse };
}
