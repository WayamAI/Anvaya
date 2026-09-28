import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getRun } from "@/server/services/mrp-read.service";

/** GET /api/v1/mrp/runs/:id — one run (or `latest` completed), parameters and open exception counts. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await getRun(actor!.companyId, params.id)),
  { permission: "mrp:read" },
);
