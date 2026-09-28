import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listExceptions } from "@/server/services/mrp-read.service";

/** GET /api/v1/mrp/runs/:id/exceptions — open first, then by severity and due date. */
export const dynamic = "force-dynamic";

export const GET = withApi<{ id: string }>(
  async ({ params, actor }) => ok(await listExceptions(actor!.companyId, params.id)),
  { permission: "mrp:read" },
);
