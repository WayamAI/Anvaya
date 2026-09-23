import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `prisma/` is included so the seed definition is validated as part of
    // the normal suite — a dangling material code in a BOM should fail here,
    // not halfway through a database seed.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "prisma/**/*.{test,spec}.{ts,tsx}"],

    /*
      The default 5s is too tight once the password tests are in the suite.
      argon2 is deliberately expensive — 19 MiB and two passes per hash — and
      several files run in parallel, so a component test doing simulated
      typing can be starved of CPU and time out despite doing nothing slow
      itself. Raising the ceiling is the right fix; weakening the hashing
      parameters to make a UI test finish would be trading real security for
      test convenience.
    */
    testTimeout: 20_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
