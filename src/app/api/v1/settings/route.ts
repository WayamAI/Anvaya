import { withApi, parseBody } from "@/server/api/with-api";
import { noContent, ok } from "@/server/api/respond";
import { getSetting, type SettingKey } from "@/server/config/company-settings";
import { prisma } from "@/server/db/client";
import { updateSettings } from "@/server/services/master-data.service";
import { updateSettingsBody } from "@/server/validation/masterdata";

/**
 * GET   /api/v1/settings — the company record and its operational settings,
 *       defaults filled in.
 * PATCH /api/v1/settings — change any of them; each change is audited.
 */
export const dynamic = "force-dynamic";

const KEYS: SettingKey[] = [
  "purchasing.overReceiptTolerancePct", "purchasing.allowSelfApproval", "sales.overDispatchTolerancePct",
  "production.overProductionTolerancePct", "production.overIssueTolerancePct", "mrp.rescheduleInToleranceDays",
];

export const GET = withApi(
  async ({ actor }) => {
    const [company, operational] = await Promise.all([
      prisma.company.findUniqueOrThrow({
        where: { id: actor!.companyId },
        select: {
          code: true, name: true, legalName: true, taxId: true, addressLine1: true, addressLine2: true,
          city: true, state: true, postalCode: true, country: true, currencyCode: true, timezone: true,
        },
      }),
      Promise.all(KEYS.map(async (k) => [k, await getSetting(actor!.companyId, k)] as const)),
    ]);
    return ok({ company, operational: Object.fromEntries(operational) });
  },
  { permission: "setting:read" },
);

export const PATCH = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    await updateSettings(await parseBody(req, updateSettingsBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "setting:update" },
);
