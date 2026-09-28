import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { materialRequirements } from "@/server/services/mrp-read.service";

/** GET /api/v1/mrp/runs/:id/materials — per material and location: stock, gross, receipts, net, cover, status. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await materialRequirements(actor!.companyId, params.id)),
  { permission: "mrp:read" },
);
