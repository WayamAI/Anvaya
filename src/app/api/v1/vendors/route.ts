import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listVendors } from "@/server/services/vendor.service";
import { listVendorsQuery } from "@/server/validation/purchasing";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/**
 * GET /api/v1/vendors — vendors by code. `?q=` `?active=` `?materialId=`
 * (only vendors supplying that material, with price and lead time, preferred
 * first).
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => ok(await listVendors(actor!.companyId, parseQuery(req, listVendorsQuery))),
  { permission: "vendor:read" },
);

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createVendor(await parseBody(req, v.createVendorBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/vendors/${row.id}`);
  },
  { permission: "vendor:create" },
);
