import { withApi, parseBody, parseQuery } from "@/server/api/with-api";
import { created, ok } from "@/server/api/respond";
import { listCustomers } from "@/server/services/customer.service";
import { listCustomersQuery } from "@/server/validation/sales";
import * as md from "@/server/services/master-data.service";
import * as v from "@/server/validation/masterdata";

/** GET /api/v1/customers — customers by code. `?q=` `?active=`. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => {
    const query = parseQuery(req, listCustomersQuery);
    const { items, nextCursor, total } = await listCustomers(actor!.companyId, query);
    return ok(items, { meta: { nextCursor, limit: query.limit, total } });
  },
  { permission: "customer:read" },
);

/** Create. The code is a permanent business key. */
export const POST = withApi(
  async ({ req, actor, requestId, clientInfo }) => {
    const row = await md.createCustomer(await parseBody(req, v.createCustomerBody), { actor: actor!, requestId, clientInfo });
    return created(row, `/api/v1/customers/${row.id}`);
  },
  { permission: "customer:create" },
);
