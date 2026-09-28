import { withApi, parseBody } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { createBom } from "@/server/services/bom-write.service";
import { createBomBody } from "@/server/validation/bom";
import { listBomProducts } from "@/server/services/bom.service";

/**
 * GET /api/v1/boms — every made product (finished, semi-finished, or with a
 * BOM), each with its BOM summary, or `bom: null` where none is recorded.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ actor }) => ok(await listBomProducts(actor!.companyId)),
  { permission: "bom:read" },
);

/** POST /api/v1/boms — one BOM per made product; its structure lives in versions. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const bom = await createBom(await parseBody(req, createBomBody), { actor: actor!, requestId, clientInfo });
    return created(bom, `/api/v1/boms/${bom.id}`);
  },
  { permission: "bom:create" },
);
