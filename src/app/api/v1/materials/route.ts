import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listMaterials } from "@/server/services/material.service";
import { listMaterialsQuery } from "@/server/validation/material";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

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

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createMaterial(await parseBody(req, v.createMaterialBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/materials/${row.id}`);
  },
  { permission: "material:create" },
);
