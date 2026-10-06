import { z } from "zod";
import { withApi, parseBody } from "@/server/api/with-api";
import { noContent } from "@/server/api/respond";
import { consume } from "@/server/api/rate-limit";

/**
 * POST /api/v1/client-errors — a screen failed to render in the browser;
 * record it in the server log, where every other failure is.
 *
 * Open to signed-out visitors (the sign-in page can fail too); the user, when
 * there is one, is attached by the request logger. Bounded in size and rate
 * limited per address, so it cannot be used to flood the log. Same-origin
 * only, like every other write.
 */
export const dynamic = "force-dynamic";

const body = z.object({
  message: z.string().trim().min(1).max(2000),
  digest: z.string().trim().max(100).optional(),
  // A path in this app, never a URL elsewhere.
  path: z.string().max(300).regex(/^\/(?!\/)\S*$/, "must be a path in this app"),
  scope: z.enum(["global", "root", "app"]),
  stack: z.string().max(8000).optional(),
}).strict();

export const POST = withApi(
  async ({ req, log, clientInfo }) => {
    await consume(`client-error:ip:${clientInfo.ipAddress ?? "unknown"}`, { max: 30, windowSeconds: 300 });
    const clientError = await parseBody(req, body);
    log.error({ clientError, userAgent: clientInfo.userAgent }, "client render error");
    return noContent();
  },
  { auth: false },
);
