import { withApi, parseBody } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { decideLotQuality } from "@/server/services/lot-quality.service";
import { lotQcBody } from "@/server/validation/purchasing";

/**
 * POST /api/v1/inventory/lots/:id/qc — `{ status, coaReference?, reason? }`.
 * APPROVED releases held stock; QUARANTINE holds it; REJECTED returns or
 * scraps what remains. A reason is required to hold or reject.
 */
export const dynamic = "force-dynamic";

export const POST = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    const input = await parseBody(req, lotQcBody);
    return ok(await decideLotQuality(params.id, input, { actor: actor!, requestId, clientInfo }));
  },
  { permission: "inventory:update" },
);
