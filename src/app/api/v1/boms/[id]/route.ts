import { z } from "zod";
import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { getBom } from "@/server/services/bom.service";

/**
 * GET /api/v1/boms/:id — the multi-level tree for the BOM's active version
 * (or `?version=`), its version history and a materials-only cost roll-up.
 */
export const dynamic = "force-dynamic";

const querySchema = z.object({ version: z.string().trim().min(1).max(40).optional() });

export const GET = withApi<{ id: string }>(
  async ({ req, params, actor }) => {
    const { version } = parseQuery(req, querySchema);
    return ok(await getBom(actor!.companyId, params.id, version));
  },
  { permission: "bom:read" },
);
