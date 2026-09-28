import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listLocations } from "@/server/services/location.service";
import { listLocationsQuery } from "@/server/validation/material";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/**
 * GET /api/v1/locations — plants, warehouses, hubs and depots. Plants first.
 *
 * A company has a handful, so the list is returned whole rather than paged.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => ok(await listLocations(actor!.companyId, parseQuery(req, listLocationsQuery))),
  { permission: "location:read" },
);

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createLocation(await parseBody(req, v.createLocationBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/locations/${row.id}`);
  },
  { permission: "location:create" },
);
