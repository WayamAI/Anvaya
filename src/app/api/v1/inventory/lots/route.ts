import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listLots } from "@/server/services/lot.service";
import { listLotsQuery } from "@/server/validation/lot";

/**
 * GET /api/v1/inventory/lots — the lot register, newest receipt first,
 * cursor-paged.
 *
 * `?q=` matches lot number, supplier lot, material, location or vendor;
 * `?qcStatus=`, `?kind=` and `?locationId=` narrow it further.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, listLotsQuery);
    const { items, nextCursor, total } = await listLots(actor!.companyId, query);
    return ok(items, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "inventory:read" },
);
