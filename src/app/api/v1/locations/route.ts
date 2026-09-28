import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listLocations } from "@/server/services/location.service";
import { listLocationsQuery } from "@/server/validation/material";

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
