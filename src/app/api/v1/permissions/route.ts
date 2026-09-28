import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { listPermissions } from "@/server/services/user-admin.service";

/** GET /api/v1/permissions — the permission catalogue, for composing roles. */
export const dynamic = "force-dynamic";

export const GET = withApi(async () => ok(await listPermissions()), { permission: "role:read" });
