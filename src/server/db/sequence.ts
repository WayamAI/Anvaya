import { randomUUID } from "node:crypto";
import type { Tx } from "./transaction";

/**
 * Business document numbers: PO-2026-0258, GRN-2026-0389, RMB-2026-0483.
 *
 * Numbers come from a counter row per company and series, advanced with one
 * atomic UPDATE ... RETURNING inside the caller's transaction. Two requests
 * can never receive the same number, and because the counter row stays
 * locked until commit, a transaction that rolls back hands its number back —
 * the series stays gap-free, which auditors of purchase and receipt registers
 * expect.
 *
 * The first time a series is used in a company the counter starts after the
 * highest number already present in that document's table, so numbers issued
 * here continue the existing (seeded or migrated) register instead of
 * colliding with it.
 */

export type DocumentKind = "PURCHASE_ORDER" | "GOODS_RECEIPT" | "PURCHASED_LOT" | "SALES_ORDER" | "WORK_ORDER" | "PRODUCED_LOT" | "MRP_RUN";

/** Prefix and whether the series restarts each year. */
const SERIES: Record<DocumentKind, { prefix: string; yearly: boolean; pad: number }> = {
  PURCHASE_ORDER: { prefix: "PO", yearly: true, pad: 4 },
  GOODS_RECEIPT: { prefix: "GRN", yearly: true, pad: 4 },
  PURCHASED_LOT: { prefix: "RMB", yearly: true, pad: 4 },
  SALES_ORDER: { prefix: "SO", yearly: false, pad: 4 },
  WORK_ORDER: { prefix: "WO", yearly: true, pad: 4 },
  PRODUCED_LOT: { prefix: "FGB", yearly: true, pad: 4 },
  MRP_RUN: { prefix: "MRP", yearly: true, pad: 4 },
};

export function seriesFor(kind: DocumentKind, year: number): string {
  const s = SERIES[kind];
  return s.yearly ? `${s.prefix}-${year}` : s.prefix;
}

export function formatDocumentNumber(series: string, value: number, pad = 4): string {
  return `${series}-${String(value).padStart(pad, "0")}`;
}

/** Numeric suffix of `${series}-NNNN`, or null for anything else. */
export function parseSuffix(series: string, number: string): number | null {
  if (!number.startsWith(`${series}-`)) return null;
  const rest = number.slice(series.length + 1);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** Highest number already used in the document's own table. */
async function existingMax(tx: Tx, kind: DocumentKind, companyId: string, series: string): Promise<number> {
  const like = `${series}-%`;
  let rows: { n: string }[];
  switch (kind) {
    case "PURCHASE_ORDER":
      rows = await tx.$queryRaw`SELECT "orderNumber" AS n FROM "purchase_orders" WHERE "companyId" = ${companyId} AND "orderNumber" LIKE ${like}`;
      break;
    case "SALES_ORDER":
      rows = await tx.$queryRaw`SELECT "orderNumber" AS n FROM "sales_orders" WHERE "companyId" = ${companyId} AND "orderNumber" LIKE ${like}`;
      break;
    case "WORK_ORDER":
      rows = await tx.$queryRaw`SELECT "orderNumber" AS n FROM "work_orders" WHERE "companyId" = ${companyId} AND "orderNumber" LIKE ${like}`;
      break;
    case "MRP_RUN":
      rows = await tx.$queryRaw`SELECT "runNumber" AS n FROM "mrp_runs" WHERE "companyId" = ${companyId} AND "runNumber" LIKE ${like}`;
      break;
    case "GOODS_RECEIPT":
      rows = await tx.$queryRaw`SELECT "grnNumber" AS n FROM "goods_receipts" WHERE "companyId" = ${companyId} AND "grnNumber" LIKE ${like}`;
      break;
    case "PURCHASED_LOT":
    case "PRODUCED_LOT":
      rows = await tx.$queryRaw`
        SELECT l."lotNumber" AS n FROM "inventory_lots" l JOIN "materials" m ON m.id = l."materialId"
        WHERE m."companyId" = ${companyId} AND l."lotNumber" LIKE ${like}`;
      break;
  }
  return rows.reduce((max, r) => Math.max(max, parseSuffix(series, r.n) ?? 0), 0);
}

export async function nextDocumentNumber(tx: Tx, companyId: string, kind: DocumentKind, year: number): Promise<string> {
  const series = seriesFor(kind, year);
  const { pad } = SERIES[kind];

  const advanced = await tx.$queryRaw<{ lastValue: number }[]>`
    UPDATE "document_sequences" SET "lastValue" = "lastValue" + 1, "updatedAt" = NOW()
    WHERE "companyId" = ${companyId} AND "series" = ${series}
    RETURNING "lastValue"`;
  if (advanced.length) return formatDocumentNumber(series, advanced[0].lastValue, pad);

  // First use of the series. ON CONFLICT covers a concurrent first use: the
  // loser increments the row the winner just inserted.
  const start = (await existingMax(tx, kind, companyId, series)) + 1;
  const inserted = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "document_sequences" ("id", "companyId", "series", "lastValue", "updatedAt")
    VALUES (${randomUUID()}, ${companyId}, ${series}, ${start}, NOW())
    ON CONFLICT ("companyId", "series")
    DO UPDATE SET "lastValue" = "document_sequences"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"`;
  return formatDocumentNumber(series, inserted[0].lastValue, pad);
}
