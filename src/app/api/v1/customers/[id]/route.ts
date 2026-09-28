import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/** PATCH /api/v1/customers/:id — deactivation refused while open orders remain. */
export const dynamic = "force-dynamic";

/** Edit. Deactivation is refused while the record is still in use. */
export const PATCH = withApi<{ id: string }>(
  async ({ req, params, actor, requestId, clientInfo }) => {
    await md.updateCustomer(params.id, await parseBody(req, v.updateCustomerBody), { actor: actor!, requestId, clientInfo });
    return noContent();
  },
  { permission: "customer:update" },
);
