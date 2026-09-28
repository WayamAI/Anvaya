import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration tests: the write side against a real Postgres.
 *
 * Transactions, row locks, unique indexes and the ledger arithmetic cannot be
 * proven with a mocked client, so these run against the database in
 * DATABASE_URL (the docker-compose one locally: `npm run db:up`). Each test
 * file builds its own throwaway company and removes it afterwards, so seeded
 * data is never read or changed.
 *
 *   npm run test:integration
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["dotenv/config"],
    // One file at a time: they share a database, and the concurrency tests
    // want the connection pool to themselves.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
