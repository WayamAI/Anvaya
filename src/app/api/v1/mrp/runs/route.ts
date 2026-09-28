import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { getRun, listRuns } from "@/server/services/mrp-read.service";
import { startMrpRun } from "@/server/services/mrp-run.service";
import { startRunBody } from "@/server/validation/mrp";

/**
 * GET  /api/v1/mrp/runs — recent runs, newest first, with headline counts.
 * POST /api/v1/mrp/runs — run MRP now. Synchronous: answers 201 with the
 *      completed run, or the failure recorded on it. One run per company at
 *      a time (409 while another is running).
 */
export const dynamic = "force-dynamic";
// A large plan can take a while; allow it on hosts that cap function time.
export const maxDuration = 300;

export const GET = withApi(async ({ actor }) => ok(await listRuns(actor!.companyId)), { permission: "mrp:read" });

export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, startRunBody);
    const run = await startMrpRun(input, { actor: actor!, requestId, clientInfo });
    return created(await getRun(actor!.companyId, run.id), `/api/v1/mrp/runs/${run.id}`);
  },
  { permission: "mrp:run" },
);
