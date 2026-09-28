import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listUnits } from "@/server/services/material.service";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/** GET /api/v1/units — units of measure, with the dimension each belongs to. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listUnits(actor!.companyId)),
  { permission: "material:read" },
);

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createUnit(await parseBody(req, v.createUnitBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/units/${row.id}`);
  },
  { permission: "material:create" },
);
