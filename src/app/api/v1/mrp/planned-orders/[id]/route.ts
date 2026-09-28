import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getPlannedOrder } from "@/server/services/mrp-read.service";

/** GET /api/v1/mrp/planned-orders/:id — explanation, pegging up to demand, and component demand below. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getPlannedOrder(actor!.companyId, params.id)),
  { permission: "mrp:read" },
);
