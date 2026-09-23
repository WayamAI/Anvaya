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
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
