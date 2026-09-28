import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listMaterials } from "@/server/services/material.service";
import { listMaterialsQuery } from "@/server/validation/material";

/**
 * GET /api/v1/materials — the item master, ordered by code, cursor-paged.
 *
 * `?q=` matches code or name; `?kind=`, `?categoryId=` and `?active=`
 * (true | false | all, default true) narrow it further.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, listMaterialsQuery);
    const { items, nextCursor, total } = await listMaterials(actor!.companyId, query);
    return ok(items, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "material:read" },
);
