import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { timePhased } from "@/server/services/mrp-read.service";
import { requirementsQuery } from "@/server/validation/mrp";

/** GET /api/v1/mrp/runs/:id/requirements?materialId=&locationId= — the time-phased record. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ req, params, actor }) => {
    const q = parseQuery(req, requirementsQuery);
    return ok(await timePhased(actor!.companyId, params.id, q.materialId, q.locationId));
  },
  { permission: "mrp:read" },
);
