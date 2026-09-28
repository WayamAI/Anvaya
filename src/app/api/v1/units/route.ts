import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listUnits } from "@/server/services/material.service";

/** GET /api/v1/units — units of measure, with the dimension each belongs to. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listUnits(actor!.companyId)),
  { permission: "material:read" },
);
