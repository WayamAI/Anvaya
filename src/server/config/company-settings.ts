import { prisma } from "@/server/db/client";
import type { Tx } from "@/server/db/transaction";

/**
 * Typed access to per-company settings (the CompanySetting table).
 *
 * Every setting has a default here, so a company that never configured one
 * gets documented behaviour rather than `undefined`. Values are validated on
 * read: a malformed stored value falls back to the default instead of
 * leaking into a calculation.
 */

const DEFAULTS = {
  /** Percentage a PO line may be over-received by. 0 = exact or under only. */
  "purchasing.overReceiptTolerancePct": 0,
  /** Whether the user who raised a PO may also approve it. */
  "purchasing.allowSelfApproval": true,
  /** Percentage a sales order line may be over-dispatched by. */
  "sales.overDispatchTolerancePct": 0,
  /** Percentage a work order may be over-produced by. */
  "production.overProductionTolerancePct": 10,
  /** Percentage a component may be issued beyond its requirement (extra scrap). */
  "production.overIssueTolerancePct": 10,
} as const;

export type SettingKey = keyof typeof DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof DEFAULTS)[K] extends number ? number : boolean;

export async function getSetting<K extends SettingKey>(companyId: string, key: K, tx?: Tx): Promise<SettingValue<K>> {
  const [namespace, name] = key.split(".") as [string, string];
  const row = await (tx ?? prisma).companySetting.findUnique({
    where: { companyId_namespace_key: { companyId, namespace, key: name } },
    select: { value: true },
  });
  const fallback = DEFAULTS[key];
  const v = row?.value;
  if (typeof fallback === "number") {
    return (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback) as SettingValue<K>;
  }
  return (typeof v === "boolean" ? v : fallback) as SettingValue<K>;
}
