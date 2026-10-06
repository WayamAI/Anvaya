/*
  Delete ended sessions and old idempotency keys (see src/server/services/retention.service.ts for the cut-offs). Safe to
  run as often as you like, e.g. from a daily scheduled job:

    npm run maintenance:purge
*/
import "dotenv/config";
import { prisma } from "../src/server/db/client";
import { purgeExpiredRecords } from "../src/server/services/retention.service";

purgeExpiredRecords()
  .then((purged) => console.log("Purged:", purged))
  .catch((e) => {
    console.error("Purge failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
