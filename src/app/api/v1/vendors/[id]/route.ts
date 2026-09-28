import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getVendor } from "@/server/services/trace-lookup.service";

/**
 * GET /api/v1/vendors/:id — approved-supplier status, the materials the
 * vendor is set up to supply, and the latest quality scorecard.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getVendor(actor!.companyId, params.id)),
  { permission: "vendor:read" },
);
