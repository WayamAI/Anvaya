import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * From Prisma 7 the connection URL lives here rather than in schema.prisma;
 * the application runtime gets its connection separately, through the pg
 * driver adapter in src/server/db/client.ts.
 *
 * `dotenv/config` above is what loads .env for CLI commands — the CLI no
 * longer reads it implicitly.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
