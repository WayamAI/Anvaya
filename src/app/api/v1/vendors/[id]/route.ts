import { withApi, parseBody } from "@/server/api/with-api";
import { noContent, ok } from "@/server/api/respond";
import { getVendor } from "@/server/services/trace-lookup.service";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/**
 * GET /api/v1/vendors/:id — approved-supplier status, the materials the
 * vendor is set up to supply, and the latest quality scorecard.
 */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getVendor(actor!.companyId, params.id)),
  { permission: "vendor:read" },
);

/** Edit. Deactivation is refused while the record is still in use. */
export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await md.updateVendor(params.id, await parseBody(req, v.updateVendorBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "vendor:update" },
);
