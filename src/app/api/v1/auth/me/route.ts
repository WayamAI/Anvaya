import { withApi } from "@/server/api/with-api";
import { ok } from "@/server/api/respond";
import { toPublicActor } from "@/server/auth/rbac";

/**
 * GET /api/v1/auth/me — the signed-in user and their effective permissions.
 *
 * The client uses the permission list to decide what to show. That is a
 * convenience only: every endpoint checks the same permissions server-side.
 */
export const dynamic = "force-dynamic";

export const GET = withApi(async ({ actor }) => ok({ user: toPublicActor(actor!) }));
