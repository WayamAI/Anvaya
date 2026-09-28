import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listMaterialCategories } from "@/server/services/material.service";

/** GET /api/v1/material-categories — every category, parents included. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listMaterialCategories(actor!.companyId)),
  { permission: "material:read" },
);
