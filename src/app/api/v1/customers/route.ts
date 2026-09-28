import { withApi, parseQuery } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listCustomers } from "@/server/services/customer.service";
import { listCustomersQuery } from "@/server/validation/sales";

/** GET /api/v1/customers — customers by code. `?q=` `?active=`. */
export const dynamic = "force-dynamic";

export const GET = withApi(
  async ({ req, actor }) => ok(await listCustomers(actor!.companyId, parseQuery(req, listCustomersQuery))),
  { permission: "customer:read" },
);
