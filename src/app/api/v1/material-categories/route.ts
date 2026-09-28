import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listMaterialCategories } from "@/server/services/material.service";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/** GET /api/v1/material-categories — every category, parents included. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listMaterialCategories(actor!.companyId)),
  { permission: "material:read" },
);

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createCategory(await parseBody(req, v.createCategoryBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/material-categories/${row.id}`);
  },
  { permission: "material:create" },
);
