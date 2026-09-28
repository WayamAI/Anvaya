import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listVendors } from "@/server/services/vendor.service";
import { listVendorsQuery } from "@/server/validation/purchasing";

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
